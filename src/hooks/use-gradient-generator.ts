import { batch, type ReadonlySignal, useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { createContext, type FunctionComponent, h } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import { createPalette, describeColor, type ColorDetails, type CubicBezierCurve, type HueMethod, type InterpolationSpace } from "~/lib/colors";
import { createPaletteChecksum, createPaletteHash, DEFAULT_PALETTE_CONFIGURATION, MAX_PALETTE_SIZE, parsePaletteHash, type PaletteConfiguration } from "~/lib/palette-link";
import type { ColorStop } from "~/types/gradient";
import { useToast } from "./use-toast";

const ADDITIONAL_COLORS = ["#8E54E9", "#4776E6", "#24C6DC", "#7ED957", "#FF6B6B", "#FFD166"];
const HISTORY_LIMIT = 100;
const makeStop = (id: number, color: string): ColorStop => ({ id, color, input: color });
export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

const cloneConfiguration = (configuration: PaletteConfiguration): PaletteConfiguration => ({
    ...configuration,
    colors: [...configuration.colors],
    easing: { ...configuration.easing },
});

const configurationsMatch = (first: PaletteConfiguration, second: PaletteConfiguration) => (
    JSON.stringify(first) === JSON.stringify(second)
);

export type PalettePointSelection = {
    kind: "generated" | "source";
    index: number;
};

type GradientGenContextValue = {
    stops: ReadonlySignal<ColorStop[]>;
    stepCount: ReadonlySignal<number>;
    minStepCount: ReadonlySignal<number>;
    maxStepCount: number;
    canAddStop: ReadonlySignal<boolean>;
    space: ReadonlySignal<InterpolationSpace>;
    hue: ReadonlySignal<HueMethod>;
    easing: ReadonlySignal<CubicBezierCurve>;
    snapToSourceColors: ReadonlySignal<boolean>;
    colors: ReadonlySignal<ColorDetails[]>;
    preview: ReadonlySignal<string>;
    selectedPalettePoint: ReadonlySignal<PalettePointSelection | undefined>;
    setStepCount: (value: number) => void;
    setSpace: (value: InterpolationSpace) => void;
    setHue: (value: HueMethod) => void;
    setEasing: (value: CubicBezierCurve) => void;
    setSnapToSourceColors: (value: boolean) => void;
    updateStop: (id: number, input: string) => void;
    commitStop: (id: number) => void;
    addStop: () => void;
    removeStop: (id: number) => void;
    moveStop: (index: number, direction: 1 | -1) => void;
    selectPalettePoint: (selection: PalettePointSelection | undefined) => void;
    beginHistoryTransaction: () => void;
    endHistoryTransaction: () => void;
    getShareUrl: () => string;
};

const GradientGenContext = createContext<GradientGenContextValue | undefined>(undefined);

export const GradientGenProvider: FunctionComponent = (props) => {

    const { notify } = useToast();
    const initialLink = useRef(parsePaletteHash(window.location.hash)).current;
    const expectedChecksum = useRef(initialLink?.checksum);
    const initialConfiguration = initialLink ?? DEFAULT_PALETTE_CONFIGURATION;
    const initialColors = initialConfiguration.colors;
    const nextId = useRef(initialColors.length);
    const stops = useSignal(initialColors.map((color, id) => makeStop(id, color)));
    const requestedStepCount = useSignal(initialConfiguration.stepCount);
    const space = useSignal<InterpolationSpace>(initialConfiguration.space);
    const hue = useSignal<HueMethod>(initialConfiguration.hue);
    const easing = useSignal<CubicBezierCurve>({ ...initialConfiguration.easing });
    const snapToSourceColors = useSignal(initialConfiguration.snapToSourceColors);
    const selectedPalettePoint = useSignal<PalettePointSelection>();
    const undoHistory = useRef<PaletteConfiguration[]>([]);
    const redoHistory = useRef<PaletteConfiguration[]>([]);
    const activePointers = useRef(new Set<number>());
    const manualHistoryTransactions = useRef(0);
    const gestureStart = useRef<PaletteConfiguration>();

    const minStepCount = useComputed(() => stops.value.length);
    const stepCount = useComputed(() => Math.min(
        MAX_PALETTE_SIZE,
        Math.max(requestedStepCount.value, minStepCount.value),
    ));

    const canAddStop = useComputed(() => stops.value.length < MAX_PALETTE_SIZE);
    const colors = useComputed(() => createPalette(
        stops.value.map(({ color }) => color),
        stepCount.value,
        space.value,
        hue.value,
        easing.value,
        snapToSourceColors.value,
    ).map(describeColor));
    const paletteChecksum = useComputed(() => createPaletteChecksum(colors.value.map(({ hex }) => hex)));

    const preview = useComputed(() => `linear-gradient(90deg, ${colors.value
        .map(({ hex }, index) => `${hex} ${(index / Math.max(colors.value.length - 1, 1)) * 100}%`)
        .join(", ")})`);

    const commitHistoryEntry = (before: PaletteConfiguration, after: PaletteConfiguration) => {
        if (configurationsMatch(before, after)) return;
        undoHistory.current.push(cloneConfiguration(before));
        if (undoHistory.current.length > HISTORY_LIMIT) undoHistory.current.shift();
        redoHistory.current = [];
    };

    const recordMutation = (before: PaletteConfiguration, after: PaletteConfiguration) => {
        if (activePointers.current.size > 0 || manualHistoryTransactions.current > 0) {
            gestureStart.current ??= cloneConfiguration(before);
            return;
        }

        commitHistoryEntry(before, after);
    };

    const mutateConfiguration = (mutation: () => void) => {
        const before = getConfiguration();
        mutation();
        recordMutation(before, getConfiguration());
    };

    const setStepCount = (value: number) => mutateConfiguration(() => {
        requestedStepCount.value = Math.min(MAX_PALETTE_SIZE, Math.max(value, minStepCount.value));
    });

    const setSpace = (value: InterpolationSpace) => mutateConfiguration(() => space.value = value);
    const setHue = (value: HueMethod) => mutateConfiguration(() => hue.value = value);
    const setSnapToSourceColors = (value: boolean) => mutateConfiguration(() => snapToSourceColors.value = value);
    const selectPalettePoint = (selection: PalettePointSelection | undefined) => selectedPalettePoint.value = selection;

    const setEasing = (value: CubicBezierCurve) => mutateConfiguration(() => {
        easing.value = {
            x1: Math.min(1, Math.max(0, value.x1)),
            y1: Math.min(1, Math.max(0, value.y1)),
            x2: Math.min(1, Math.max(0, value.x2)),
            y2: Math.min(1, Math.max(0, value.y2)),
        };
    });

    const updateStop = (id: number, input: string) => {
        mutateConfiguration(() => {
            const normalized = input.startsWith("#") ? input : `#${input}`;
            stops.value = stops.value.map((stop) => stop.id === id ? {
                ...stop,
                input: normalized.toUpperCase(),
                color: isHexColor(normalized) ? normalized.toUpperCase() : stop.color,
            } : stop);
        });
    };

    const commitStop = (id: number) => {
        stops.value = stops.value.map((stop) => stop.id === id ? { ...stop, input: stop.color } : stop);
    };

    const addStop = () => {
        if (!canAddStop.value) return;

        mutateConfiguration(() => {
            const id = nextId.current;
            const color = ADDITIONAL_COLORS[(id - DEFAULT_PALETTE_CONFIGURATION.colors.length) % ADDITIONAL_COLORS.length];
            const nextStops = [...stops.value, makeStop(id, color)];

            batch(() => {
                stops.value = nextStops;
                requestedStepCount.value = Math.max(requestedStepCount.value, nextStops.length);
            });

            nextId.current += 1;
        });
    };

    const removeStop = (id: number) => {
        if (stops.value.length <= 2) return;
        mutateConfiguration(() => stops.value = stops.value.filter((stop) => stop.id !== id));
    };

    const moveStop = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= stops.value.length) return;

        mutateConfiguration(() => {
            const reordered = [...stops.value];
            [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
            stops.value = reordered;
        });
    };

    const getConfiguration = (): PaletteConfiguration => ({
        colors: stops.value.map(({ color }) => color),
        stepCount: stepCount.value,
        space: space.value,
        hue: hue.value,
        easing: easing.value,
        snapToSourceColors: snapToSourceColors.value,
    });

    const applyConfiguration = (configuration: PaletteConfiguration) => {
        batch(() => {
            stops.value = configuration.colors.map((color, id) => makeStop(id, color));
            requestedStepCount.value = configuration.stepCount;
            space.value = configuration.space;
            hue.value = configuration.hue;
            easing.value = { ...configuration.easing };
            snapToSourceColors.value = configuration.snapToSourceColors;
            selectedPalettePoint.value = undefined;
        });

        nextId.current = configuration.colors.length;
    };

    const commitPendingTransaction = () => {
        if (activePointers.current.size > 0 || manualHistoryTransactions.current > 0) return;
        const before = gestureStart.current;
        gestureStart.current = undefined;
        if (before) commitHistoryEntry(before, getConfiguration());
    };

    const finishPointerGesture = (pointerId?: number) => {
        if (pointerId === undefined) activePointers.current.clear();
        else activePointers.current.delete(pointerId);
        commitPendingTransaction();
    };

    const beginHistoryTransaction = () => {
        manualHistoryTransactions.current += 1;
    };

    const endHistoryTransaction = () => {
        manualHistoryTransactions.current = Math.max(0, manualHistoryTransactions.current - 1);
        commitPendingTransaction();
    };

    const undo = () => {
        const configuration = undoHistory.current.pop();
        if (!configuration) return;

        redoHistory.current.push(cloneConfiguration(getConfiguration()));
        applyConfiguration(configuration);
    };

    const redo = () => {
        const configuration = redoHistory.current.pop();
        if (!configuration) return;

        undoHistory.current.push(cloneConfiguration(getConfiguration()));
        applyConfiguration(configuration);
    };

    const syncHash = () => {
        const hash = createPaletteHash(getConfiguration(), paletteChecksum.value);
        if (window.location.hash !== hash) window.history.replaceState(window.history.state, "", hash);
        return hash;
    };

    useSignalEffect(() => {
        const restoredChecksum = expectedChecksum.current;
        if (restoredChecksum) {
            expectedChecksum.current = undefined;

            if (restoredChecksum !== paletteChecksum.value) {
                notify("Shared palette checksum mismatch. It may have been created with a different generator version.", {
                    duration: 6000,
                    tone: "warning",
                });
            }
        }

        syncHash();
    });

    useEffect(() => {
        const startPointerGesture = (event: PointerEvent) => {
            activePointers.current.add(event.pointerId);
        };

        const endPointerGesture = (event: PointerEvent) => finishPointerGesture(event.pointerId);
        const endAllPointerGestures = () => finishPointerGesture();
        
        const handleShortcut = (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") return;
            if (activePointers.current.size > 0) return;

            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        };

        window.addEventListener("pointerdown", startPointerGesture, true);
        window.addEventListener("pointerup", endPointerGesture);
        window.addEventListener("pointercancel", endPointerGesture);
        window.addEventListener("blur", endAllPointerGestures);
        window.addEventListener("keydown", handleShortcut);

        return () => {
            window.removeEventListener("pointerdown", startPointerGesture, true);
            window.removeEventListener("pointerup", endPointerGesture);
            window.removeEventListener("pointercancel", endPointerGesture);
            window.removeEventListener("blur", endAllPointerGestures);
            window.removeEventListener("keydown", handleShortcut);
        };
    }, []);

    useEffect(() => {
        const loadHash = () => {
            const configuration = parsePaletteHash(window.location.hash);
            if (configuration) {
                expectedChecksum.current = configuration.checksum;
                applyConfiguration(configuration);
                undoHistory.current = [];
                redoHistory.current = [];
                gestureStart.current = undefined;
                activePointers.current.clear();
                manualHistoryTransactions.current = 0;
            }
            else syncHash();
        };

        window.addEventListener("hashchange", loadHash);
        return () => window.removeEventListener("hashchange", loadHash);
    }, []);

    const getShareUrl = () => {
        const url = new URL(window.location.href);
        url.hash = syncHash();
        return url.toString();
    };

    const value: GradientGenContextValue = {
        stops,
        stepCount,
        minStepCount,
        maxStepCount: MAX_PALETTE_SIZE,
        canAddStop,
        space,
        hue,
        easing,
        snapToSourceColors,
        colors,
        preview,
        selectedPalettePoint,
        setStepCount,
        setSpace,
        setHue,
        setEasing,
        setSnapToSourceColors,
        updateStop,
        commitStop,
        addStop,
        removeStop,
        moveStop,
        selectPalettePoint,
        beginHistoryTransaction,
        endHistoryTransaction,
        getShareUrl,
    };

    return h(GradientGenContext.Provider, { value }, props.children);
};

export const useGradientGenerator = () => {
    const ctx = useContext(GradientGenContext);

    if (!ctx) throw new Error("useGradientGenerator must be used within GradientGenProvider");
    return ctx;
};
