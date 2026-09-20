import { useSignal } from "@preact/signals";
import type { TargetedPointerEvent } from "preact";
import { useRef } from "preact/hooks";
import type { ColorDetails } from "~/lib/colors";
import { classes, st, vars } from "./style.st.css";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const DRAG_START_THRESHOLD = 3;

const LightnessChart = (props: {
    colors: ColorDetails[];
    selectedIndex?: number;
    hoveredIndex?: number;
    focusedIndex?: number;
    onSelect: (index: number) => void;
    onHoveredIndexChange: (index: number | undefined) => void;
    onFocusedIndexChange: (index: number | undefined) => void;
    onLightnessChange: (index: number, lightness: number) => void;
}) => {

    const track = useRef<HTMLDivElement>(null);
    const draggingIndex = useSignal<number>();

    const dragGesture = useRef<{
        index: number;
        originX: number;
        originY: number;
        offsetY: number;
        active: boolean;
    }>();

    const setLightnessFromPointer = (index: number, clientY: number) => {
        const bounds = track.current?.getBoundingClientRect();
        if (!bounds) return;

        const progress = clamp((clientY - bounds.top) / bounds.height, 0, 1);
        props.onLightnessChange(index, Math.round((100 - (progress * 100)) * 10) / 10);
    };

    const startDragging = (event: TargetedPointerEvent<HTMLSpanElement>, index: number) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const bounds = event.currentTarget.getBoundingClientRect();
        
        draggingIndex.value = index;
        dragGesture.current = {
            index,
            originX: event.clientX,
            originY: event.clientY,
            offsetY: bounds.top + (bounds.height / 2) - event.clientY,
            active: false,
        };

        props.onSelect(index);
        props.onFocusedIndexChange(index);
    };

    const moveDragging = (event: TargetedPointerEvent<HTMLSpanElement>, index: number) => {
        const gesture = dragGesture.current;
        if (draggingIndex.value !== index || gesture?.index !== index) return;

        const distance = Math.hypot(
            event.clientX - gesture.originX,
            event.clientY - gesture.originY,
        );

        if (!gesture.active && distance < DRAG_START_THRESHOLD) return;

        gesture.active = true;
        setLightnessFromPointer(index, event.clientY + gesture.offsetY);
    };

    const stopDragging = (event: TargetedPointerEvent<HTMLSpanElement>, index: number) => {
        if (draggingIndex.value !== index) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        draggingIndex.value = undefined;
        dragGesture.current = undefined;
    };

    return (
        <div class={classes.lightnessChart}>
            <div ref={track} class={classes.lightnessTrack}>
                {props.colors.map((color, index) => {
                    const selected = props.selectedIndex === index;
                    const hovered = props.hoveredIndex === index;
                    const dragging = draggingIndex.value === index;

                    return (
                        <span class={st(classes.lightnessIndicator, { selected, hovered, dragging })} data-palette-point="source-lightness"
                            style={{
                                [vars.lightnessPosition]: `${(100 - color.lightness) / 10}rem`,
                                [vars.hex]: color.hex,
                            }}

                            onBlur={() => props.onFocusedIndexChange(undefined)}
                            onPointerEnter={() => props.onHoveredIndexChange(index)}
                            onPointerLeave={() => props.onHoveredIndexChange(undefined)}
                            onPointerDown={(event) => startDragging(event, index)}
                            onPointerMove={(event) => moveDragging(event, index)}
                            onPointerUp={(event) => stopDragging(event, index)}
                            onPointerCancel={(event) => stopDragging(event, index)}
                            key={index}
                        >
                            <span class={classes.lightnessLine} />
                            <svg class={classes.lightnessGrabber} viewBox="0 0 18 12" aria-hidden="true">
                                <polygon class={classes.lightnessGrabberShape} points="0,6 5,0 18,0 18,12 5,12" />
                                <polygon class={classes.lightnessGrabberHighlight} points="0,6 5,0 18,0 18,12 5,12" />
                            </svg>
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

export default LightnessChart;
