import PaletteSwatch from "~/components/palette-swatch";
import SectionHeading from "~/components/section-heading";
import { classes, st } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import PaletteTexturePreview from "../palette-texture-preview";
import { createPalette, describeColor, getInsertionIndex, getPaletteSourcePositions, getSnappedGeneratedIndexes, type ColorDetails } from "~/lib/colors";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { TargetedMouseEvent } from "preact";

const GeneratedPalette = () => {

    const {
        colors,
        stops,
        stepCount,
        space,
        hue,
        easing,
        snapToSourceColors,
        canAddStop,
        setStepCount,
        selectedPalettePoint,
        hoveredPalettePoint,
        insertStop,
        removeStop,
        selectPalettePoint,
        hoverPalettePoint,
        beginHistoryTransaction,
        endHistoryTransaction,
    } = useGradientGenerator();

    const addSourceMode = useSignal(false);
    const removeSourceMode = useSignal(false);
    const insertionGapIndex = useSignal<number>();
    const insertionIndicatorEdge = useSignal<"before" | "after">();
    const pointerWithinPalette = useRef(false);
    const capturedAltPress = useRef(false);
    const swatchElements = useRef<Array<HTMLButtonElement | null>>([]);
    const pointerPosition = useRef<{ x: number; y: number }>();
    const refreshInsertionGap = useRef<() => void>(() => undefined);
    const selection = selectedPalettePoint.value;
    const hover = hoveredPalettePoint.value;
    let generatedIndexesBySource = new Map<number, number>();

    if (snapToSourceColors.value) {
        generatedIndexesBySource = getSnappedGeneratedIndexes(
            getPaletteSourcePositions(
                stops.value.map(({ color }) => color),
                space.value,
                hue.value,
            ),
            stepCount.value,
            easing.value,
        );
    }

    if (stops.value.length > 0 && colors.value.length > 0) {
        generatedIndexesBySource.set(0, 0);
        generatedIndexesBySource.set(stops.value.length - 1, colors.value.length - 1);
    }

    const sourceIndexesByGenerated = new Map(
        [...generatedIndexesBySource].map(([sourceIndex, generatedIndex]) => [generatedIndex, sourceIndex]),
    );

    let selectedIndex: number | undefined;
    let hoveredIndex: number | undefined;

    if (selection?.kind === "generated") {
        selectedIndex = selection.index;
    } else if (selection?.kind === "source") {
        selectedIndex = generatedIndexesBySource.get(selection.index);
    }

    if (hover?.kind === "generated") {
        hoveredIndex = hover.index;
    } else if (hover?.kind === "source") {
        hoveredIndex = generatedIndexesBySource.get(hover.index);
    }

    const handleSwatchHover = (isHovered: boolean, generatedIndex: number, sourceIndex?: number) => {
        if (!isHovered) {
            hoverPalettePoint(undefined);
            return;
        }

        if (sourceIndex !== undefined) {
            hoverPalettePoint({ kind: "source", index: sourceIndex });
            return;
        }

        hoverPalettePoint({ kind: "generated", index: generatedIndex });
    };

    const getSourceInsertionIndex = (color: ColorDetails) => getInsertionIndex(
        stops.peek().map(({ color: sourceColor }) => sourceColor),
        color.hex,
        space.peek(),
        hue.peek(),
    );

    const updateInsertionGap = () => {
        const pointer = pointerPosition.current;

        if (!addSourceMode.peek() || !canAddStop.peek() || !pointer) {
            insertionGapIndex.value = undefined;
            insertionIndicatorEdge.value = undefined;
            return;
        }

        let closestGap: number | undefined;
        let closestEdge: "before" | "after" | undefined;
        let closestDistance = Number.POSITIVE_INFINITY;

        for (let gapIndex = 1; gapIndex < swatchElements.current.length; gapIndex += 1) {
            const leftSwatch = swatchElements.current[gapIndex - 1];
            const rightSwatch = swatchElements.current[gapIndex];
            if (!leftSwatch || !rightSwatch) continue;

            const leftBounds = leftSwatch.getBoundingClientRect();
            const rightBounds = rightSwatch.getBoundingClientRect();
            const leftCenterY = (leftBounds.top + leftBounds.bottom) / 2;
            const rightCenterY = (rightBounds.top + rightBounds.bottom) / 2;
            const leftCenterX = (leftBounds.left + leftBounds.right) / 2;
            const rightCenterX = (rightBounds.left + rightBounds.right) / 2;
            const isSameRow = Math.abs(leftCenterY - rightCenterY) <= 4;
            let distance: number;
            let indicatorEdge: "before" | "after" = "before";

            if (isSameRow) {
                const overlapTop = Math.max(leftBounds.top, rightBounds.top);
                const overlapBottom = Math.min(leftBounds.bottom, rightBounds.bottom);
                if (pointer.y < overlapTop || pointer.y > overlapBottom) continue;
                if (pointer.x < leftCenterX || pointer.x > rightCenterX) continue;

                const boundary = (leftBounds.right + rightBounds.left) / 2;
                distance = Math.abs(pointer.x - boundary);
            } else {
                const rowGapTop = Math.min(leftBounds.bottom, rightBounds.bottom);
                const rowGapBottom = Math.max(leftBounds.top, rightBounds.top);
                const isWithinRowGap = pointer.y >= rowGapTop && pointer.y <= rowGapBottom;
                const isWithinLeftSwatch = pointer.y >= leftBounds.top && pointer.y <= leftBounds.bottom;
                const isWithinRightSwatch = pointer.y >= rightBounds.top && pointer.y <= rightBounds.bottom;
                const targetsLeftEdge = (isWithinRightSwatch || isWithinRowGap) && pointer.x <= rightCenterX;
                const targetsRightEdge = (isWithinLeftSwatch || isWithinRowGap) && pointer.x >= leftCenterX;

                if (!targetsLeftEdge && !targetsRightEdge) continue;

                if (targetsRightEdge && !targetsLeftEdge) {
                    distance = Math.abs(pointer.x - leftBounds.right);
                    indicatorEdge = "after";
                } else if (targetsLeftEdge && !targetsRightEdge) {
                    distance = Math.abs(pointer.x - rightBounds.left);
                } else {
                    const distanceFromPreviousRow = Math.abs(pointer.y - leftBounds.bottom);
                    const distanceFromNextRow = Math.abs(pointer.y - rightBounds.top);
                    indicatorEdge = distanceFromPreviousRow <= distanceFromNextRow ? "after" : "before";
                    distance = Math.min(distanceFromPreviousRow, distanceFromNextRow);
                }
            }

            if (distance < closestDistance) {
                closestGap = gapIndex;
                closestEdge = indicatorEdge;
                closestDistance = distance;
            }
        }

        insertionGapIndex.value = closestGap;
        insertionIndicatorEdge.value = closestEdge;
    };

    refreshInsertionGap.current = updateInsertionGap;

    const insertGeneratedColor = (color: ColorDetails, enableSnapping: boolean) => {
        if (!canAddStop.peek()) return;
        const insertionIndex = getSourceInsertionIndex(color);

        insertStop(color.hex, insertionIndex, enableSnapping);
        selectPalettePoint({ kind: "source", index: insertionIndex });
    };

    const insertColorAtGap = (gapIndex: number) => {
        const generatedColors = colors.peek();
        const leftColor = generatedColors[gapIndex - 1];
        const rightColor = generatedColors[gapIndex];
        if (!leftColor || !rightColor) return;

        const midpoint = createPalette(
            [leftColor.hex, rightColor.hex],
            3,
            space.peek(),
            hue.peek(),
        )[1];

        if (!midpoint) return;
        const previousStepCount = stepCount.peek();

        beginHistoryTransaction();
        try {
        insertGeneratedColor(describeColor(midpoint), true);
            setStepCount(previousStepCount + 1);
        } finally {
            endHistoryTransaction();
        }

        insertionGapIndex.value = undefined;
        insertionIndicatorEdge.value = undefined;
    };

    const removeGeneratedSource = (sourceIndex: number, reduceStepCount = false) => {
        const sourceStops = stops.peek();
        if (sourceIndex === 0 || sourceIndex === sourceStops.length - 1) return;

        const stop = sourceStops[sourceIndex];
        if (!stop) return;

        selectPalettePoint(undefined);
        hoverPalettePoint(undefined);

        if (!reduceStepCount) {
            removeStop(stop.id);
            return;
        }

        const previousStepCount = stepCount.peek();
        beginHistoryTransaction();
        try {
            removeStop(stop.id);
            setStepCount(previousStepCount - 1);
        } finally {
            endHistoryTransaction();
        }
    };

    const handleSwatchClick = (
        event: TargetedMouseEvent<HTMLButtonElement>,
        sourceIndex?: number,
    ) => {
        if (event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            if (sourceIndex !== undefined) removeGeneratedSource(sourceIndex, true);
            return;
        }

        if (!event.ctrlKey) return;

        event.preventDefault();
        event.stopPropagation();
    };

    const handleGridClick = (event: TargetedMouseEvent<HTMLDivElement>) => {
        if (!event.ctrlKey || event.altKey) return;
        const gapIndex = insertionGapIndex.peek();
        if (gapIndex === undefined) return;

        event.preventDefault();
        event.stopPropagation();
        insertColorAtGap(gapIndex);
    };

    const handleSwatchDoubleClick = (
        event: TargetedMouseEvent<HTMLButtonElement>,
        color: ColorDetails,
        sourceIndex?: number,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.altKey || event.ctrlKey) return;

        if (sourceIndex !== undefined) {
            removeGeneratedSource(sourceIndex);
            return;
        }

        insertGeneratedColor(color, true);
    };

    useEffect(() => {
        const updateModifierModes = (event: KeyboardEvent) => {
            const isPlainAlt = event.key === "Alt" && !event.ctrlKey && !event.metaKey && !event.shiftKey;

            if (isPlainAlt && event.type === "keydown" && pointerWithinPalette.current) {
                capturedAltPress.current = true;
            }

            if (isPlainAlt && capturedAltPress.current) {
                event.preventDefault();
                if (event.type === "keyup") capturedAltPress.current = false;
            }

            addSourceMode.value = event.ctrlKey && !event.altKey;
            removeSourceMode.value = event.altKey;
            if (addSourceMode.value) hoverPalettePoint(undefined);
            refreshInsertionGap.current();
        };

        const clearModifierModes = () => {
            addSourceMode.value = false;
            removeSourceMode.value = false;
            capturedAltPress.current = false;
            insertionGapIndex.value = undefined;
            insertionIndicatorEdge.value = undefined;
        };

        window.addEventListener("keydown", updateModifierModes);
        window.addEventListener("keyup", updateModifierModes);
        window.addEventListener("blur", clearModifierModes);

        return () => {
            window.removeEventListener("keydown", updateModifierModes);
            window.removeEventListener("keyup", updateModifierModes);
            window.removeEventListener("blur", clearModifierModes);
        };
    }, []);

    return (
        <section
            class={classes.root}
            onPointerEnter={() => pointerWithinPalette.current = true}
            onPointerLeave={() => {
                pointerWithinPalette.current = false;
                pointerPosition.current = undefined;
                insertionGapIndex.value = undefined;
                insertionIndicatorEdge.value = undefined;
            }}
        >

            <SectionHeading title="Generated palette" />

            <PaletteTexturePreview colors={colors.value} />

            <div
                class={st(classes.swatchGrid, { addMode: addSourceMode.value })}
                onPointerMove={(event) => {
                    pointerPosition.current = { x: event.clientX, y: event.clientY };
                    refreshInsertionGap.current();
                }}
                onPointerLeave={() => {
                    pointerPosition.current = undefined;
                    insertionGapIndex.value = undefined;
                    insertionIndicatorEdge.value = undefined;
                }}
                onClickCapture={handleGridClick}
            >
                {colors.value.map((color, index) => {
                    const sourceIndex = sourceIndexesByGenerated.get(index);

                    return (
                        <PaletteSwatch
                            color={color}
                            sourceIndex={sourceIndex}
                            selected={index === selectedIndex}
                            hovered={index === hoveredIndex}
                            addMode={addSourceMode.value}
                            removeMode={removeSourceMode.value && sourceIndex !== undefined}
                            insertionBefore={insertionGapIndex.value === index && insertionIndicatorEdge.value === "before"}
                            insertionAfter={insertionGapIndex.value === index + 1 && insertionIndicatorEdge.value === "after"}
                            elementRef={(element) => {
                                swatchElements.current[index] = element;
                            }}
                            onHoverChange={(isHovered) => handleSwatchHover(isHovered, index, sourceIndex)}
                            onModifiedClick={(event) => handleSwatchClick(event, sourceIndex)}
                            onDoubleClick={(event) => handleSwatchDoubleClick(event, color, sourceIndex)}
                            key={`${color.hex}-${index}`}
                        />
                    );
                })}
            </div>

        </section>
    );
};

export default GeneratedPalette;
