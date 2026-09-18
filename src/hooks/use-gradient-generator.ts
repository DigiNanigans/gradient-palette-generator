import { batch, type ReadonlySignal, useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { createContext, type FunctionComponent, h } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import { createPalette, describeColor, type ColorDetails, type CubicBezierCurve, type HueMethod, type InterpolationSpace } from "~/lib/colors";
import { createPaletteChecksum, createPaletteHash, DEFAULT_PALETTE_CONFIGURATION, MAX_PALETTE_SIZE, parsePaletteHash, type PaletteConfiguration } from "~/lib/palette-link";
import type { ColorStop } from "~/types/gradient";
import { useToast } from "./use-toast";

const ADDITIONAL_COLORS = ["#8E54E9", "#4776E6", "#24C6DC", "#7ED957", "#FF6B6B", "#FFD166"];
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
        const color = ADDITIONAL_COLORS[(id - DEFAULT_PALETTE_CONFIGURATION.colors.length) % ADDITIONAL_COLORS.length];
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
            easing.value = configuration.easing;
            snapToSourceColors.value = configuration.snapToSourceColors;
        });

        nextId.current = configuration.colors.length;
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
        const loadHash = () => {
            const configuration = parsePaletteHash(window.location.hash);
            if (configuration) {
                expectedChecksum.current = configuration.checksum;
                applyConfiguration(configuration);
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
        getShareUrl,
    };

    return h(GradientGenContext.Provider, { value }, props.children);
};

export const useGradientGenerator = () => {
    const ctx = useContext(GradientGenContext);

    if (!ctx) throw new Error("useGradientGenerator must be used within GradientGenProvider");
    return ctx;
};
