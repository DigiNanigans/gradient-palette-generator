import { batch, type ReadonlySignal, useComputed, useSignal } from "@preact/signals";
import { createContext, type FunctionComponent, h } from "preact";
import { useContext, useRef } from "preact/hooks";
import { createPalette, describeColor, LINEAR_EASING_CURVE, type ColorDetails, type CubicBezierCurve, type HueMethod, type InterpolationSpace } from "~/lib/colors";
import type { ColorStop } from "~/types/gradient";

const INITIAL_COLORS = ["#F9D976", "#F39F86"];
const ADDITIONAL_COLORS = ["#8E54E9", "#4776E6", "#24C6DC", "#7ED957", "#FF6B6B", "#FFD166"];
const MAX_PALETTE_SIZE = 32;

const makeStop = (id: number, color: string): ColorStop => ({ id, color, input: color });
export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

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
};

const GradientGenContext = createContext<GradientGenContextValue | undefined>(undefined);

export const GradientGenProvider: FunctionComponent = (props) => {

    const nextId = useRef(INITIAL_COLORS.length);
    const stops = useSignal(INITIAL_COLORS.map((color, id) => makeStop(id, color)));
    const requestedStepCount = useSignal(8);
    const space = useSignal<InterpolationSpace>("oklch");
    const hue = useSignal<HueMethod>("shorter");
    const easing = useSignal<CubicBezierCurve>({ ...LINEAR_EASING_CURVE });
    const snapToSourceColors = useSignal(false);

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

    const preview = useComputed(() => `linear-gradient(90deg, ${colors.value
        .map(({ hex }, index) => `${hex} ${(index / Math.max(colors.value.length - 1, 1)) * 100}%`)
        .join(", ")})`);

    const setStepCount = (value: number) => requestedStepCount.value = Math.min(MAX_PALETTE_SIZE, Math.max(value, minStepCount.value));
    const setSpace = (value: InterpolationSpace) => space.value = value;
    const setHue = (value: HueMethod) => hue.value = value;
    const setSnapToSourceColors = (value: boolean) => snapToSourceColors.value = value;

    const setEasing = (value: CubicBezierCurve) => easing.value = {
        x1: Math.min(1, Math.max(0, value.x1)),
        y1: Math.min(1, Math.max(0, value.y1)),
        x2: Math.min(1, Math.max(0, value.x2)),
        y2: Math.min(1, Math.max(0, value.y2)),
    };

    const updateStop = (id: number, input: string) => {
        const normalized = input.startsWith("#") ? input : `#${input}`;
        stops.value = stops.value.map((stop) => stop.id === id ? {
            ...stop,
            input: normalized.toUpperCase(),
            color: isHexColor(normalized) ? normalized.toUpperCase() : stop.color,
        } : stop);
    };

    const commitStop = (id: number) => {
        stops.value = stops.value.map((stop) => stop.id === id ? { ...stop, input: stop.color } : stop);
    };

    const addStop = () => {
        if (!canAddStop.value) return;

        const id = nextId.current;
        const color = ADDITIONAL_COLORS[(id - INITIAL_COLORS.length) % ADDITIONAL_COLORS.length];
        const nextStops = [...stops.value, makeStop(id, color)];

        batch(() => {
            stops.value = nextStops;
            requestedStepCount.value = Math.max(requestedStepCount.value, nextStops.length);
        });

        nextId.current += 1;
    };

    const removeStop = (id: number) => {
        if (stops.value.length <= 2) return;
        stops.value = stops.value.filter((stop) => stop.id !== id);
    };

    const moveStop = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= stops.value.length) return;

        const reordered = [...stops.value];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        stops.value = reordered;
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
    };

    return h(GradientGenContext.Provider, { value }, props.children);
};

export const useGradientGenerator = () => {
    const ctx = useContext(GradientGenContext);

    if (!ctx) throw new Error("useGradientGenerator must be used within GradientGenProvider");
    return ctx;
};
