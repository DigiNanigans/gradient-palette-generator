import type { JSX, TargetedKeyboardEvent, TargetedPointerEvent } from "preact";
import { useRef } from "preact/hooks";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import { LINEAR_EASING_CURVE, type CubicBezierCurve } from "~/lib/colors";
import { classes } from "./style.st.css";

type Handle = 1 | 2;
type Coordinate = keyof CubicBezierCurve;

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;
const format = (value: number) => value.toFixed(2);
const GRAPH_WIDTH = 160;
const GRAPH_HEIGHT = 90;

const EasingCurveControl = () => {

    const { easing, setEasing } = useGradientGenerator();
    const graph = useRef<SVGSVGElement>(null);
    const activeHandle = useRef<Handle | null>(null);

    const updateCoordinate = (coordinate: Coordinate, value: number) => {
        if (!Number.isFinite(value)) return;
        setEasing({ ...easing.value, [coordinate]: round(clamp(value)) });
    };

    const updateHandle = (handle: Handle, clientX: number, clientY: number) => {
        const bounds = graph.current?.getBoundingClientRect();
        if (!bounds) return;

        const x = round(clamp((clientX - bounds.left) / bounds.width));
        const y = round(1 - clamp((clientY - bounds.top) / bounds.height));

        setEasing(handle === 1 ? { ...easing.value, x1: x, y1: y } : { ...easing.value, x2: x, y2: y });
    };

    const startDrag = (handle: Handle, event: TargetedPointerEvent<SVGCircleElement>) => {
        activeHandle.current = handle;
        event.currentTarget.setPointerCapture(event.pointerId);
        updateHandle(handle, event.clientX, event.clientY);
    };

    const curve = easing.value;
    const firstX = curve.x1 * GRAPH_WIDTH;
    const firstY = (1 - curve.y1) * GRAPH_HEIGHT;
    const secondX = curve.x2 * GRAPH_WIDTH;
    const secondY = (1 - curve.y2) * GRAPH_HEIGHT;
    const curvePath = `M 0 ${GRAPH_HEIGHT} C ${firstX} ${firstY}, ${secondX} ${secondY}, ${GRAPH_WIDTH} 0`;
    const isAltered = (Object.keys(LINEAR_EASING_CURVE) as Coordinate[]).some((coordinate) => curve[coordinate] !== LINEAR_EASING_CURVE[coordinate]);

    return (
        <div class={classes.root}>
            <div class={classes.graphPanel}>
                <svg
                    ref={graph}
                    class={classes.graph}
                    viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                    role="group"
                    aria-label="Cubic Bézier easing curve editor"
                    onPointerMove={(event) => {
                        if (activeHandle.current) updateHandle(activeHandle.current, event.clientX, event.clientY);
                    }}
                    onPointerUp={() => activeHandle.current = null}
                    onPointerCancel={() => activeHandle.current = null}
                >
                    {[25, 50, 75].map((position) => (
                        <g key={position}>
                            <line class={classes.gridLine} x1={(position / 100) * GRAPH_WIDTH} y1="0" x2={(position / 100) * GRAPH_WIDTH} y2={GRAPH_HEIGHT} />
                            <line class={classes.gridLine} x1="0" y1={(position / 100) * GRAPH_HEIGHT} x2={GRAPH_WIDTH} y2={(position / 100) * GRAPH_HEIGHT} />
                        </g>
                    ))}
                    <line class={classes.linearGuide} x1="0" y1={GRAPH_HEIGHT} x2={GRAPH_WIDTH} y2="0" />
                    <line class={classes.controlLine} x1="0" y1={GRAPH_HEIGHT} x2={firstX} y2={firstY} />
                    <line class={classes.controlLine} x1={GRAPH_WIDTH} y1="0" x2={secondX} y2={secondY} />
                    <path class={classes.curve} d={curvePath} />
                    <circle class={classes.endpoint} cx="0" cy={GRAPH_HEIGHT} r="2" />
                    <circle class={classes.endpoint} cx={GRAPH_WIDTH} cy="0" r="2" />
                    <circle
                        class={classes.handle}
                        cx={firstX}
                        cy={firstY}
                        r="4"
                        tabIndex={0}
                        role="slider"
                        aria-label="First curve handle"
                        aria-valuemin={0}
                        aria-valuemax={1}
                        aria-valuenow={curve.x1}
                        aria-valuetext={`x ${format(curve.x1)}, y ${format(curve.y1)}`}
                        onPointerDown={(event) => startDrag(1, event)}
                    />
                    <circle
                        class={classes.handle}
                        cx={secondX}
                        cy={secondY}
                        r="4"
                        tabIndex={0}
                        role="slider"
                        aria-label="Second curve handle"
                        aria-valuemin={0}
                        aria-valuemax={1}
                        aria-valuenow={curve.x2}
                        aria-valuetext={`x ${format(curve.x2)}, y ${format(curve.y2)}`}
                        onPointerDown={(event) => startDrag(2, event)}
                    />
                </svg>

                {isAltered && (
                    <button type="button" class={classes.resetButton} title="Reset easing curve"
                        onClick={() => setEasing({ ...LINEAR_EASING_CURVE })}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4.93 4.93a10 10 0 1 1-1.88 11.4l1.9-.62A8 8 0 1 0 6.34 6.34L9 9H2V2l2.93 2.93Z" />
                        </svg>
                    </button>
                )}
            </div>

            <div class={classes.headingRow}>
                <div>
                    <span class={classes.label}>Easing curve</span>
                    <p class={classes.description}>Drag the handles to shape interpolation within each colour transition.</p>
                </div>
            </div>

            <div class={classes.fields}>
                {(["x1", "y1", "x2", "y2"] as Coordinate[]).map((coordinate) => (
                    <label class={classes.field} key={coordinate}>
                        <span>{coordinate}</span>
                        <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={format(curve[coordinate])}
                            onInput={(event) => updateCoordinate(coordinate, event.currentTarget.valueAsNumber)}
                            onBlur={(event) => event.currentTarget.value = format(easing.value[coordinate])}
                        />
                    </label>
                ))}
            </div>

        </div>
    );
};

export default EasingCurveControl;
