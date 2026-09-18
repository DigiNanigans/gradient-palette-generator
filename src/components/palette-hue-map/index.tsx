import { batch, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { ColorDetails } from "~/lib/colors";
import { classes, st } from "./style.st.css";

const INITIAL_GRAPH_WIDTH = 480;
const GRAPH_HEIGHT = 160;
const MARKER_INSET = 7;
const HUE_SAMPLE_COUNT = 12;
const SOURCE_MARKER_RADIUS = 12;
const MAX_FIELD_PIXEL_RATIO = 2;
const UPDATE_THROTTLE_MS = 80;
const RESIZE_SETTLE_MS = 120;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360;

const getPaletteLightness = (colors: ColorDetails[]) => {
    if (colors.length === 0) return 50;

    const lightnessValues = colors.map(({ lightness }) => clamp(lightness, 0, 100)).sort((a, b) => a - b);
    const average = lightnessValues.reduce((sum, lightness) => sum + lightness, 0) / lightnessValues.length;
    const middleIndex = Math.floor(lightnessValues.length / 2);
    const median = lightnessValues.length % 2 === 0 ? (lightnessValues[middleIndex - 1] + lightnessValues[middleIndex]) / 2 : lightnessValues[middleIndex];

    return (average + median) / 2;
};

const getHueWindow = (colors: ColorDetails[]) => {
    const hues = colors
        .filter(({ saturation }) => saturation > 0.5)
        .map(({ hue }) => normalizeHue(hue))
        .sort((a, b) => a - b);

    if (hues.length === 0) return { center: 0, start: -18, span: 36 };

    let largestGap = -1;
    let arcStart = hues[0];

    hues.forEach((hue, index) => {
        const nextHue = index === hues.length - 1 ? hues[0] + 360 : hues[index + 1];
        const gap = nextHue - hue;

        if (gap > largestGap) {
            largestGap = gap;
            arcStart = nextHue;
        }
    });

    const arcSpan = 360 - largestGap;
    const center = arcStart + (arcSpan / 2);
    const padding = Math.max(12, arcSpan * 0.12);
    const span = Math.min(360, Math.max(36, arcSpan + (padding * 2)));

    return { center, start: center - (span / 2), span };
};

const getSaturationWindow = (colors: ColorDetails[]) => {
    
    const saturations = colors.map(({ saturation }) => clamp(saturation, 0, 100));
    const minimum = Math.min(...saturations);
    const maximum = Math.max(...saturations);
    const padding = Math.max(5, (maximum - minimum) * 0.15);
    
    let start = clamp(minimum - padding, 0, 100);
    let end = clamp(maximum + padding, 0, 100);

    if (end - start < 20) {
        const center = (start + end) / 2;
        start = clamp(center - 10, 0, 80);
        end = start + 20;
    }

    return { start, end, span: end - start };
};

const PaletteHueMap = (props: {
    colors: ColorDetails[];
    sourceColors: ColorDetails[];
}) => {

    const graph = useRef<SVGSVGElement>(null);
    const field = useRef<HTMLCanvasElement>(null);
    const graphWidth = useSignal(INITIAL_GRAPH_WIDTH);
    const pointsReady = useSignal(false);
    const isResizing = useSignal(false);
    const resizeTimer = useRef<number | undefined>(undefined);
    const drawHueMapRef = useRef<() => void>(() => undefined);
    const throttledData = useSignal({ colors: props.colors, sourceColors: props.sourceColors });
    const pendingData = useRef(throttledData.value);
    const lastUpdate = useRef(0);
    const updateTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (props.colors === throttledData.value.colors && props.sourceColors === throttledData.value.sourceColors) return;

        pendingData.current = { colors: props.colors, sourceColors: props.sourceColors };

        const flushUpdate = () => {
            updateTimer.current = undefined;
            lastUpdate.current = Date.now();
            throttledData.value = pendingData.current;
        };

        const remaining = UPDATE_THROTTLE_MS - (Date.now() - lastUpdate.current);

        if (remaining <= 0) {
            if (updateTimer.current !== undefined) window.clearTimeout(updateTimer.current);
            flushUpdate();
        } else if (updateTimer.current === undefined) {
            updateTimer.current = window.setTimeout(flushUpdate, remaining);
        }

    }, [props.colors, props.sourceColors]);

    useEffect(() => () => {
        if (updateTimer.current !== undefined) window.clearTimeout(updateTimer.current);
    }, []);

    const mapColors = throttledData.value.colors;
    const mapSourceColors = throttledData.value.sourceColors;
    const allColors = [...mapColors, ...mapSourceColors];
    const hueWindow = getHueWindow(allColors);
    const saturationWindow = getSaturationWindow(allColors);
    const paletteLightness = getPaletteLightness(mapColors);
    const plotWidth = graphWidth.value - (MARKER_INSET * 2);
    const plotHeight = GRAPH_HEIGHT - (MARKER_INSET * 2);

    const unwrapHue = (hue: number) => {
        return hueWindow.center + ((((normalizeHue(hue) - hueWindow.center) + 540) % 360) - 180);
    };

    const orderedColors = mapColors.filter(({ saturation }) => saturation > 0.5);
    const reverseHueAxis = orderedColors.length > 1 && unwrapHue(orderedColors[0].hue) > unwrapHue(orderedColors[orderedColors.length - 1].hue);

    const drawHueMap = () => {
        const element = graph.current;
        const canvas = field.current;
        if (!element || !canvas) return;

        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;

        graphWidth.value = (bounds.width / bounds.height) * GRAPH_HEIGHT;

        const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_FIELD_PIXEL_RATIO);
        const width = Math.max(1, Math.round(bounds.width * pixelRatio));
        const height = Math.max(1, Math.round(bounds.height * pixelRatio));
        const markerInset = MARKER_INSET * (bounds.height / GRAPH_HEIGHT) * pixelRatio;

        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) return;

        for (let y = 0; y < height; y += 1) {
            const saturationProgress = clamp((y - markerInset) / Math.max(height - (markerInset * 2), 1), 0, 1,);
            const saturation = saturationWindow.end - (saturationWindow.span * saturationProgress);
            const gradient = context.createLinearGradient(markerInset, 0, width - markerInset, 0);

            for (let index = 0; index <= HUE_SAMPLE_COUNT; index += 1) {
                const progress = index / HUE_SAMPLE_COUNT;
                const hueProgress = reverseHueAxis ? 1 - progress : progress;
                const hue = normalizeHue(hueWindow.start + (hueWindow.span * hueProgress));
                gradient.addColorStop(progress, `hsl(${hue} ${saturation}% ${paletteLightness}%)`);
            }

            context.fillStyle = gradient;
            context.fillRect(0, y, width, 1);
        }
    };

    drawHueMapRef.current = drawHueMap;

    useEffect(() => {
        drawHueMap();
    }, [hueWindow.start, hueWindow.span, paletteLightness, reverseHueAxis, saturationWindow.end, saturationWindow.span]);

    useEffect(() => {
        const element = graph.current;
        if (!element) return;

        const handleResize = () => {
            batch(() => {
                isResizing.value = true;
                drawHueMapRef.current();
            });

            if (resizeTimer.current !== undefined) window.clearTimeout(resizeTimer.current);
            resizeTimer.current = window.setTimeout(() => {
                batch(() => {
                    isResizing.value = false;
                    pointsReady.value = true;
                });
                resizeTimer.current = undefined;
            }, RESIZE_SETTLE_MS);
        };

        const resizeObserver = new ResizeObserver(handleResize);

        resizeObserver.observe(element);
        handleResize();

        return () => {
            resizeObserver.disconnect();
            if (resizeTimer.current !== undefined) window.clearTimeout(resizeTimer.current);
        };
        
    }, []);
    
    const getPosition = (color: ColorDetails) => {
        const hue = color.saturation <= 0.5 ? hueWindow.center : unwrapHue(color.hue);
        const hueProgress = (hue - hueWindow.start) / hueWindow.span;

        return {
            x: MARKER_INSET + ((reverseHueAxis ? 1 - hueProgress : hueProgress) * plotWidth),
            y: MARKER_INSET + (((saturationWindow.end - clamp(color.saturation, 0, 100)) / saturationWindow.span) * plotHeight),
        };
    };

    return (
        <figure class={classes.root}>
            <figcaption class={classes.caption}>
                <span class={classes.label}>Hue map</span>
            </figcaption>

            <div class={classes.plot}>
                <canvas ref={field} class={classes.field} aria-hidden="true" />
                <svg ref={graph} class={classes.graph} viewBox={`0 0 ${graphWidth.value} ${GRAPH_HEIGHT}`}>
                    {mapSourceColors.map((color, index) => {
                        const position = getPosition(color);

                        return (
                            <g
                                class={st(classes.point, { animated: pointsReady.value && !isResizing.value }, classes.sourceMarker)}
                                transform={`translate(${position.x} ${position.y})`}
                                key={`source-${index}`}
                            >
                                <line x1={-SOURCE_MARKER_RADIUS} y1="0" x2={SOURCE_MARKER_RADIUS} y2="0" />
                                <line x1="0" y1={-SOURCE_MARKER_RADIUS} x2="0" y2={SOURCE_MARKER_RADIUS} />
                            </g>
                        );
                    })}

                    {mapColors.map((color, index) => {
                        const position = getPosition(color);

                        return (
                            <g
                                class={st(classes.point, { animated: pointsReady.value && !isResizing.value })}
                                transform={`translate(${position.x} ${position.y})`}
                                key={index}
                            >
                                <circle class={classes.marker} cx="0" cy="0" r="8" fill={color.hex} />
                                <circle class={classes.markerHighlight} cx="0" cy="0" r="8" />
                            </g>
                        );
                    })}
                </svg>
            </div>

        </figure>
    );
};

export default PaletteHueMap;
