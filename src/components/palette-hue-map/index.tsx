import { batch, useSignal } from "@preact/signals";
import type { TargetedPointerEvent } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { describeColor, getPaletteSourcePositions, getSnappedGeneratedIndexes, type ColorDetails } from "~/lib/colors";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import { classes, st } from "./style.st.css";
import LightnessChart from "./lightness-chart";

const INITIAL_GRAPH_WIDTH = 480;
const GRAPH_HEIGHT = 160;
const MARKER_INSET = 7;
const HUE_SAMPLE_COUNT = 12;
const SOURCE_MARKER_RADIUS = 12;
const MAX_FIELD_PIXEL_RATIO = 2;
const UPDATE_THROTTLE_MS = 80;
const RESIZE_SETTLE_MS = 120;
const DRAG_START_THRESHOLD = 3;
const POINT_TRANSITION_MS = 160;

type DragViewport = {
    hueStart: number;
    hueSpan: number;
    saturationStart: number;
    saturationEnd: number;
    reverseHueAxis: boolean;
};

type DragPointer = {
    x: number;
    y: number;
};

type DragGesture = {
    origin: DragPointer;
    offset: DragPointer;
    active: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360;
const isPastHueMethodThreshold = (hue: number, anchorHue: number) => normalizeHue(hue - anchorHue) > 180;

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

    const ctx = useGradientGenerator();

    const graph = useRef<SVGSVGElement>(null);
    const field = useRef<HTMLCanvasElement>(null);
    const graphWidth = useSignal(INITIAL_GRAPH_WIDTH);
    const pointsReady = useSignal(false);
    const isResizing = useSignal(false);
    const focusedSource = useSignal<number>();
    const resizeTimer = useRef<number | undefined>(undefined);
    const drawHueMapRef = useRef<() => void>(() => undefined);
    const throttledData = useSignal({ colors: props.colors, sourceColors: props.sourceColors });
    const pendingData = useRef(throttledData.value);
    const lastUpdate = useRef(0);
    const updateTimer = useRef<number | undefined>(undefined);
    const draggedSource = useRef<number | undefined>(undefined);
    const draggedSourceLightness = useRef<number | undefined>(undefined);
    const draggedHue = useRef<number | undefined>(undefined);
    const adjacentHues = useRef<number[]>([]);
    const dragPointer = useRef<DragPointer | undefined>(undefined);
    const dragGesture = useRef<DragGesture | undefined>(undefined);
    const dragPointerDirty = useRef(false);
    const draggedGeneratedIndex = useRef<number | undefined>(undefined);
    const settlingGeneratedIndex = useSignal<number>();
    const settleGeneratedTimer = useRef<number | undefined>(undefined);
    const normalViewportRef = useRef<DragViewport | undefined>(undefined);
    const dragFrame = useRef<number | undefined>(undefined);
    const cropResetFrame = useRef<number | undefined>(undefined);
    const sourceNodes = useRef<Array<SVGGElement | null>>([]);
    const generatedNodes = useRef<Array<SVGGElement | null>>([]);
    const directTransforms = useRef({ source: [] as string[], generated: [] as string[] });
    const dragViewport = useSignal<DragViewport>();

    useEffect(() => {
        if (props.colors === throttledData.value.colors && props.sourceColors === throttledData.value.sourceColors) return;

        pendingData.current = { colors: props.colors, sourceColors: props.sourceColors };

        const flushUpdate = () => {
            updateTimer.current = undefined;
            lastUpdate.current = Date.now();
            throttledData.value = pendingData.current;
        };

        if (draggedSource.current !== undefined) {
            if (updateTimer.current !== undefined) window.clearTimeout(updateTimer.current);
            flushUpdate();
            return;
        }

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
        if (settleGeneratedTimer.current !== undefined) window.clearTimeout(settleGeneratedTimer.current);
        if (dragFrame.current !== undefined) window.cancelAnimationFrame(dragFrame.current);
        if (cropResetFrame.current !== undefined) window.cancelAnimationFrame(cropResetFrame.current);
    }, []);

    useEffect(() => {
        const clearSelectionOutsideNodes = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest("[data-palette-point]")) return;
            focusedSource.value = undefined;
            ctx.selectPalettePoint(undefined);
        };

        document.addEventListener("pointerdown", clearSelectionOutsideNodes, true);
        return () => document.removeEventListener("pointerdown", clearSelectionOutsideNodes, true);
    }, []);

    const mapColors = throttledData.value.colors;
    const mapSourceColors = throttledData.value.sourceColors;

    const snappedGeneratedIndexes = ctx.snapToSourceColors.value
        ? getSnappedGeneratedIndexes(
            getPaletteSourcePositions(
                mapSourceColors.map(({ hex }) => hex),
                ctx.space.value,
                ctx.hue.value,
            ),
            ctx.stepCount.value,
            ctx.easing.value,
        )
        : new Map<number, number>();

    const snappedSourceIndexes = new Map(
        [...snappedGeneratedIndexes].map(([sourceIndex, generatedIndex]) => [generatedIndex, sourceIndex]),
    );

    const allColors = [...mapColors, ...mapSourceColors];
    const normalHueWindow = getHueWindow(allColors);
    const normalSaturationWindow = getSaturationWindow(allColors);
    const paletteLightness = getPaletteLightness(mapColors);
    const plotWidth = graphWidth.value - (MARKER_INSET * 2);
    const plotHeight = GRAPH_HEIGHT - (MARKER_INSET * 2);

    const unwrapHueForWindow = (hue: number, center: number) => {
        return center + ((((normalizeHue(hue) - center) + 540) % 360) - 180);
    };

    const orderedSourceColors = mapSourceColors.filter(({ saturation }) => saturation > 0.5);
    const firstSourceHue = orderedSourceColors[0]?.hue;
    const lastSourceHue = orderedSourceColors[orderedSourceColors.length - 1]?.hue;
    const forwardHueDistance = firstSourceHue === undefined || lastSourceHue === undefined
        ? 0
        : normalizeHue(lastSourceHue - firstSourceHue);

    const normalReverseHueAxis = orderedSourceColors.length > 1 && (ctx.hue.value === "shorter" ? forwardHueDistance > 180 : forwardHueDistance <= 180);

    normalViewportRef.current = {
        hueStart: normalHueWindow.start,
        hueSpan: normalHueWindow.span,
        saturationStart: normalSaturationWindow.start,
        saturationEnd: normalSaturationWindow.end,
        reverseHueAxis: normalReverseHueAxis,
    };

    const activeDragViewport = dragViewport.value;

    const hueWindow = activeDragViewport ? {
        center: activeDragViewport.hueStart + (activeDragViewport.hueSpan / 2),
        start: activeDragViewport.hueStart,
        span: activeDragViewport.hueSpan,
    } : normalHueWindow;

    const saturationWindow = activeDragViewport ? {
        start: activeDragViewport.saturationStart,
        end: activeDragViewport.saturationEnd,
        span: activeDragViewport.saturationEnd - activeDragViewport.saturationStart,
    } : normalSaturationWindow;

    const reverseHueAxis = activeDragViewport?.reverseHueAxis ?? normalReverseHueAxis;
    const isDragging = draggedSource.current !== undefined;

    const unwrapHue = (hue: number) => unwrapHueForWindow(hue, hueWindow.center);

    const drawHueMap = () => {
        const element = graph.current;
        const canvas = field.current;
        if (!element || !canvas) return;

        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;

        graphWidth.value = (bounds.width / bounds.height) * GRAPH_HEIGHT;

        const pixelRatio = draggedSource.current === undefined ? Math.min(window.devicePixelRatio || 1, MAX_FIELD_PIXEL_RATIO) : 1;

        const width = Math.max(1, Math.round(bounds.width * pixelRatio));
        const height = Math.max(1, Math.round(bounds.height * pixelRatio));
        const markerInset = MARKER_INSET * (bounds.height / GRAPH_HEIGHT) * pixelRatio;

        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) return;

        const rowHeight = draggedSource.current === undefined ? 1 : 2;

        for (let y = 0; y < height; y += rowHeight) {
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
            context.fillRect(0, y, width, rowHeight);
        }
    };

    drawHueMapRef.current = drawHueMap;

    useEffect(() => drawHueMap(), [
        hueWindow.start,
        hueWindow.span,
        isDragging,
        paletteLightness,
        reverseHueAxis,
        saturationWindow.end,
        saturationWindow.span
    ]);

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

    const getPositionInViewport = (color: ColorDetails, viewport: DragViewport) => {
        const center = viewport.hueStart + (viewport.hueSpan / 2);
        const hue = color.saturation <= 0.5 ? center : unwrapHueForWindow(color.hue, center);
        const hueProgress = (hue - viewport.hueStart) / viewport.hueSpan;
        const saturationSpan = viewport.saturationEnd - viewport.saturationStart;

        return {
            x: MARKER_INSET + ((viewport.reverseHueAxis ? 1 - hueProgress : hueProgress) * plotWidth),
            y: MARKER_INSET + (((viewport.saturationEnd - clamp(color.saturation, 0, 100)) / saturationSpan) * plotHeight),
        };
    };

    const updateNodeTransforms = (viewport: DragViewport, draggedIndex: number, draggedColor: ColorDetails, pointerPosition: { x: number; y: number }) => {
        const sourceColors = props.sourceColors.map((color, index) => index === draggedIndex ? draggedColor : color);
        const generatedIndex = draggedGeneratedIndex.current;
        const pointerTransform = `translate(${pointerPosition.x} ${pointerPosition.y})`;

        directTransforms.current.source = sourceColors.map((color, index) => {
            const position = index === draggedIndex ? pointerPosition : getPositionInViewport(color, viewport);
            const transform = index === draggedIndex ? pointerTransform : `translate(${position.x} ${position.y})`;
            sourceNodes.current[index]?.setAttribute("transform", transform);
            return transform;
        });

        directTransforms.current.generated = ctx.colors.peek().map((color, index) => {
            const position = index === generatedIndex ? pointerPosition : getPositionInViewport(color, viewport);
            const transform = index === generatedIndex ? pointerTransform : `translate(${position.x} ${position.y})`;
            generatedNodes.current[index]?.setAttribute("transform", transform);
            return transform;
        });
    };

    const updateDraggedSource = (pointer: DragPointer, index: number) => {

        const element = graph.current;
        const source = props.sourceColors[index];
        const stop = ctx.stops.value[index];
        const viewport = dragViewport.value;
        
        if (!element || !source || !stop || !viewport) return;

        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;

        const mappingGraphWidth = graphWidth.value;
        const mappingPlotWidth = mappingGraphWidth - (MARKER_INSET * 2);
        const localX = (pointer.x - bounds.left) / bounds.width * mappingGraphWidth;
        const localY = (pointer.y - bounds.top) / bounds.height * GRAPH_HEIGHT;
        const x = clamp(localX, MARKER_INSET, mappingGraphWidth - MARKER_INSET);
        const y = clamp(localY, MARKER_INSET, GRAPH_HEIGHT - MARKER_INSET);
        const visualHueProgress = (x - MARKER_INSET) / mappingPlotWidth;
        const hueProgress = viewport.reverseHueAxis ? 1 - visualHueProgress : visualHueProgress;
        const hue = normalizeHue(viewport.hueStart + (viewport.hueSpan * hueProgress));
        const saturationProgress = (y - MARKER_INSET) / plotHeight;
        const saturationSpan = viewport.saturationEnd - viewport.saturationStart;
        const saturation = viewport.saturationEnd - (saturationSpan * saturationProgress);
        const lightness = draggedSourceLightness.current ?? source.lightness;
        const color = describeColor(`hsl(${hue} ${saturation}% ${lightness}%)`);
        const previousHue = draggedHue.current;

        const crossedHueMethodThreshold = previousHue !== undefined
            && adjacentHues.current.some((anchorHue) => (
                isPastHueMethodThreshold(previousHue, anchorHue)
                !== isPastHueMethodThreshold(hue, anchorHue)
            ));

        if (stop.color !== color.hex || crossedHueMethodThreshold) {
            batch(() => {
                if (crossedHueMethodThreshold) {
                    ctx.setHue(ctx.hue.peek() === "shorter" ? "longer" : "shorter");
                }
                if (stop.color !== color.hex) ctx.updateStop(stop.id, color.hex);
            });
        }

        let nextGeneratedIndex: number | undefined;
        if (ctx.snapToSourceColors.peek()) {
            const currentSourcePositions = getPaletteSourcePositions(
                ctx.stops.peek().map(({ color: stopColor }) => stopColor),
                ctx.space.peek(),
                ctx.hue.peek(),
            );

            nextGeneratedIndex = getSnappedGeneratedIndexes(
                currentSourcePositions,
                ctx.stepCount.peek(),
                ctx.easing.peek(),
            ).get(index);
        }

        if (nextGeneratedIndex !== draggedGeneratedIndex.current) {
            draggedGeneratedIndex.current = nextGeneratedIndex;
            if (settleGeneratedTimer.current !== undefined) window.clearTimeout(settleGeneratedTimer.current);
            settlingGeneratedIndex.value = nextGeneratedIndex;
            settleGeneratedTimer.current = nextGeneratedIndex === undefined
                ? undefined
                : window.setTimeout(() => {
                    settlingGeneratedIndex.value = undefined;
                    settleGeneratedTimer.current = undefined;
                }, POINT_TRANSITION_MS);
        }

        draggedHue.current = hue;
        updateNodeTransforms(viewport, index, color, { x, y });
    };

    const runDragUpdates = () => {
        const index = draggedSource.current;
        const pointer = dragPointer.current;

        if (index === undefined || !pointer) {
            dragFrame.current = undefined;
            return;
        }

        if (dragPointerDirty.current) {
            dragPointerDirty.current = false;
            const gesture = dragGesture.current;
            if (gesture) {
                const distance = Math.hypot(
                    pointer.x - gesture.origin.x,
                    pointer.y - gesture.origin.y,
                );
                if (gesture.active || distance >= DRAG_START_THRESHOLD) {
                    gesture.active = true;
                    updateDraggedSource({
                        x: pointer.x + gesture.offset.x,
                        y: pointer.y + gesture.offset.y,
                    }, index);
                }
            }
        }

        dragFrame.current = window.requestAnimationFrame(runDragUpdates);
    };

    const startSourceDrag = (event: TargetedPointerEvent<SVGGElement>, index: number) => {

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);

        if (cropResetFrame.current !== undefined) window.cancelAnimationFrame(cropResetFrame.current);
        if (dragFrame.current !== undefined) window.cancelAnimationFrame(dragFrame.current);

        const normalViewport = normalViewportRef.current;
        const markerBounds = event.currentTarget.getBoundingClientRect();

        draggedSource.current = index;
        draggedGeneratedIndex.current = snappedGeneratedIndexes.get(index);
        draggedSourceLightness.current = props.sourceColors[index]?.lightness ?? 50;
        draggedHue.current = props.sourceColors[index]?.hue;
        adjacentHues.current = [index - 1, index + 1]
            .map((adjacentIndex) => props.sourceColors[adjacentIndex]?.hue)
            .filter((adjacentHue): adjacentHue is number => adjacentHue !== undefined);

        dragPointer.current = { x: event.clientX, y: event.clientY };
        dragGesture.current = {
            origin: dragPointer.current,
            offset: {
                x: markerBounds.left + (markerBounds.width / 2) - event.clientX,
                y: markerBounds.top + (markerBounds.height / 2) - event.clientY,
            },
            active: false,
        };

        dragPointerDirty.current = false;
        batch(() => {
            dragViewport.value = {
                hueStart: normalViewport?.hueStart ?? normalHueWindow.start,
                hueSpan: normalViewport?.hueSpan ?? normalHueWindow.span,
                saturationStart: normalViewport?.saturationStart ?? normalSaturationWindow.start,
                saturationEnd: normalViewport?.saturationEnd ?? normalSaturationWindow.end,
                reverseHueAxis: normalViewport?.reverseHueAxis ?? normalReverseHueAxis,
            };
            ctx.selectPalettePoint({ kind: "source", index });
        });
        dragFrame.current = window.requestAnimationFrame(runDragUpdates);
    };

    const moveSourceDrag = (event: TargetedPointerEvent<SVGGElement>, index: number) => {
        if (draggedSource.current !== index) return;
        dragPointer.current = { x: event.clientX, y: event.clientY };
        dragPointerDirty.current = true;
    };

    const finishSourceDrag = (event: TargetedPointerEvent<SVGGElement>, index: number) => {
        if (draggedSource.current !== index) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        draggedSource.current = undefined;
        draggedGeneratedIndex.current = undefined;
        settlingGeneratedIndex.value = undefined;
        if (settleGeneratedTimer.current !== undefined) window.clearTimeout(settleGeneratedTimer.current);
        settleGeneratedTimer.current = undefined;
        draggedSourceLightness.current = undefined;
        draggedHue.current = undefined;
        adjacentHues.current = [];
        dragPointer.current = undefined;
        dragGesture.current = undefined;
        dragPointerDirty.current = false;
        
        if (dragFrame.current !== undefined) window.cancelAnimationFrame(dragFrame.current);
        
        dragFrame.current = undefined;
        
        if (updateTimer.current !== undefined) window.clearTimeout(updateTimer.current);
        
        updateTimer.current = undefined;
        lastUpdate.current = Date.now();
        pendingData.current = {
            colors: props.colors,
            sourceColors: props.sourceColors
        };
        
        batch(() => {
            throttledData.value = pendingData.current;
        });

        cropResetFrame.current = window.requestAnimationFrame(() => {
            directTransforms.current = { source: [], generated: [] };
            dragViewport.value = undefined;
            cropResetFrame.current = undefined;
        });
    };

    const selection = ctx.selectedPalettePoint.value;
    const updateSourceLightness = (index: number, lightness: number) => {
        const color = props.sourceColors[index];
        const stop = ctx.stops.value[index];
        if (!color || !stop) return;

        const nextColor = describeColor(`hsl(${color.hue} ${color.saturation}% ${lightness}%)`);
        if (nextColor.hex !== stop.color) ctx.updateStop(stop.id, nextColor.hex);
    };

    return (
        <figure class={classes.root}>
            <figcaption class={classes.caption}>
                <span class={classes.label}>Hue map</span>
            </figcaption>

            <div class={classes.visualizations}>
                <div class={classes.plot}>
                    <canvas ref={field} class={classes.field} aria-hidden="true" />
                    <svg ref={graph} class={classes.graph} viewBox={`0 0 ${graphWidth.value} ${GRAPH_HEIGHT}`}>
                        {mapSourceColors.map((color, index) => {
                            const position = getPosition(color);
                            const isDragged = isDragging && draggedSource.current === index;
                            
                            const isSelected = selection?.kind === "source"
                                ? selection.index === index
                                : selection?.kind === "generated" && snappedSourceIndexes.get(selection.index) === index;
                            
                            const transform = isDragging
                                ? directTransforms.current.source[index] ?? `translate(${position.x} ${position.y})`
                                : `translate(${position.x} ${position.y})`;

                            return (
                                <g
                                    ref={(element) => {
                                        sourceNodes.current[index] = element;
                                    }}
                                    class={st(classes.point, {
                                        animated: pointsReady.value && !isResizing.value && !isDragged,
                                        selected: isSelected,
                                        dragging: isDragged,
                                    }, classes.sourceMarker)}
                                    transform={transform}
                                    key={`source-${index}`}
                                    data-palette-point="source"
                                    onClick={() => ctx.selectPalettePoint({ kind: "source", index })}
                                    onPointerDown={(event) => startSourceDrag(event, index)}
                                    onPointerMove={(event) => moveSourceDrag(event, index)}
                                    onPointerUp={(event) => finishSourceDrag(event, index)}
                                    onPointerCancel={(event) => finishSourceDrag(event, index)}
                                >
                                    <circle class={classes.sourceMarkerHitTarget} cx="0" cy="0" r={SOURCE_MARKER_RADIUS} />
                                    <line class={classes.sourceMarkerOutline} x1={-SOURCE_MARKER_RADIUS} y1="0" x2={SOURCE_MARKER_RADIUS} y2="0" />
                                    <line class={classes.sourceMarkerOutline} x1="0" y1={-SOURCE_MARKER_RADIUS} x2="0" y2={SOURCE_MARKER_RADIUS} />
                                    <line class={classes.sourceMarkerLine} x1={-SOURCE_MARKER_RADIUS} y1="0" x2={SOURCE_MARKER_RADIUS} y2="0" />
                                    <line class={classes.sourceMarkerLine} x1="0" y1={-SOURCE_MARKER_RADIUS} x2="0" y2={SOURCE_MARKER_RADIUS} />
                                </g>
                            );
                        })}

                        {mapColors.map((color, index) => {
                            const position = getPosition(color);
                            const isDragged = isDragging && draggedGeneratedIndex.current === index;
                            const selectedGeneratedIndex = selection?.kind === "source"
                                ? snappedGeneratedIndexes.get(selection.index)
                                : selection?.kind === "generated"
                                    ? selection.index
                                    : undefined;
                            const isSelected = selectedGeneratedIndex === index;
                            const sourceIndex = snappedSourceIndexes.get(index);
                            const transform = isDragging
                                ? directTransforms.current.generated[index] ?? `translate(${position.x} ${position.y})`
                                : `translate(${position.x} ${position.y})`;

                            return (
                                <g
                                    ref={(element) => {
                                        generatedNodes.current[index] = element;
                                    }}
                                    class={st(classes.point, {
                                        animated: pointsReady.value && !isResizing.value && (!isDragged || settlingGeneratedIndex.value === index),
                                        selected: isSelected,
                                        shared: sourceIndex !== undefined,
                                    })}
                                    transform={transform}
                                    key={index}
                                    data-palette-point="generated"
                                    onClick={() => ctx.selectPalettePoint(sourceIndex === undefined
                                        ? { kind: "generated", index }
                                        : { kind: "source", index: sourceIndex })}
                                >
                                    <circle class={classes.marker} cx="0" cy="0" r="8" fill={color.hex} />
                                    <circle class={classes.markerHighlight} cx="0" cy="0" r={isSelected ? 9 : 8} />
                                </g>
                            );
                        })}
                    </svg>
                </div>

                <LightnessChart
                    colors={props.sourceColors}
                    selectedIndex={selection?.kind === "source" ? selection.index : undefined}
                    focusedIndex={focusedSource.value}
                    onSelect={(index) => ctx.selectPalettePoint({ kind: "source", index })}
                    onFocusedIndexChange={(index) => focusedSource.value = index}
                    onLightnessChange={updateSourceLightness}
                />
            </div>

        </figure>
    );
};

export default PaletteHueMap;
