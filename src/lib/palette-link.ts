import type { CubicBezierCurve, HueMethod, InterpolationSpace } from "./colors";

export const MAX_PALETTE_SIZE = 32;

export type PaletteConfiguration = {
    colors: string[];
    stepCount: number;
    space: InterpolationSpace;
    hue: HueMethod;
    easing: CubicBezierCurve;
    snapToSourceColors: boolean;
};

type PalettePayload = {
    clrs: string[];
    step: number;
    spac: InterpolationSpace;
    huem: HueMethod;
    ease: [number, number, number, number];
    snap: 0 | 1;
    chek?: string;
};

const SPACES: InterpolationSpace[] = ["oklch", "lch", "oklab", "lab", "hsl", "hwb", "srgb"];
const HUE_METHODS: HueMethod[] = ["shorter", "longer"];
const HEX_COLOR = /^[0-9a-f]{6}$/i;
const HASH_PREFIX = "#/";
const CHECKSUM = /^[0-9a-z]{7}$/;

export const DEFAULT_PALETTE_CONFIGURATION: PaletteConfiguration = {
    colors: ["#F9D976", "#F39F86"],
    stepCount: 8,
    space: "oklch",
    hue: "shorter",
    easing: {
        x1: 1 / 3,
        y1: 1 / 3,
        x2: 2 / 3,
        y2: 2 / 3,
    },
    snapToSourceColors: false,
};

const encodeBase64Url = (value: string) => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";

    bytes.forEach((byte) => binary += String.fromCharCode(byte));

    return globalThis.btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
};

const decodeBase64Url = (value: string) => {
    if (!/^[a-z0-9_-]+$/i.test(value)) throw new Error("Invalid palette link");

    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const binary = globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

const isUnitNumber = (value: unknown): value is number => (
    typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1
);

export const createPaletteChecksum = (colors: string[]) => {
    let checksum = 0x811c9dc5;

    for (const color of colors) {
        for (const character of `${color.toUpperCase()}|`) {
            checksum ^= character.charCodeAt(0);
            checksum = Math.imul(checksum, 0x01000193);
        }
    }

    return (checksum >>> 0).toString(36).padStart(7, "0");
};

export const createPaletteHash = (configuration: PaletteConfiguration, checksum?: string) => {
    const payload: PalettePayload = {
        clrs: configuration.colors.map((color) => color.slice(1).toUpperCase()),
        step: configuration.stepCount,
        spac: configuration.space,
        huem: configuration.hue,
        ease: [
            configuration.easing.x1,
            configuration.easing.y1,
            configuration.easing.x2,
            configuration.easing.y2,
        ],
        snap: configuration.snapToSourceColors ? 1 : 0,
    };

    if (checksum && CHECKSUM.test(checksum)) payload.chek = checksum;

    return `${HASH_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
};

export const parsePaletteHash = (hash: string): (PaletteConfiguration & { checksum?: string }) | undefined => {
    if (!hash.startsWith(HASH_PREFIX) || hash.length <= HASH_PREFIX.length) return;

    try {
        const payload: unknown = JSON.parse(decodeBase64Url(hash.slice(HASH_PREFIX.length)));
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

        const values = payload as Record<string, unknown>;
        const colors = (
            Array.isArray(values.clrs)
            && values.clrs.length >= 2
            && values.clrs.length <= MAX_PALETTE_SIZE
            && values.clrs.every((color): color is string => typeof color === "string" && HEX_COLOR.test(color))
        )
            ? values.clrs.map((color) => `#${color.toUpperCase()}`)
            : [...DEFAULT_PALETTE_CONFIGURATION.colors];

        const requestedStepCount = (
            typeof values.step === "number"
            && Number.isInteger(values.step)
            && values.step >= 2
            && values.step <= MAX_PALETTE_SIZE
        ) ? values.step : DEFAULT_PALETTE_CONFIGURATION.stepCount;

        const rawEasing = Array.isArray(values.ease) ? values.ease : [];
        const defaultEasing = DEFAULT_PALETTE_CONFIGURATION.easing;

        const configuration: PaletteConfiguration & { checksum?: string } = {
            colors,
            stepCount: Math.max(requestedStepCount, colors.length),
            space: typeof values.spac === "string" && SPACES.includes(values.spac as InterpolationSpace)
                ? values.spac as InterpolationSpace
                : DEFAULT_PALETTE_CONFIGURATION.space,
            hue: typeof values.huem === "string" && HUE_METHODS.includes(values.huem as HueMethod)
                ? values.huem as HueMethod
                : DEFAULT_PALETTE_CONFIGURATION.hue,
            easing: {
                x1: isUnitNumber(rawEasing[0]) ? rawEasing[0] : defaultEasing.x1,
                y1: isUnitNumber(rawEasing[1]) ? rawEasing[1] : defaultEasing.y1,
                x2: isUnitNumber(rawEasing[2]) ? rawEasing[2] : defaultEasing.x2,
                y2: isUnitNumber(rawEasing[3]) ? rawEasing[3] : defaultEasing.y2,
            },
            snapToSourceColors: values.snap === 0 || values.snap === 1
                ? values.snap === 1
                : DEFAULT_PALETTE_CONFIGURATION.snapToSourceColors,
        };

        if (typeof values.chek === "string" && CHECKSUM.test(values.chek)) configuration.checksum = values.chek;
        return configuration;
    } catch {
        return;
    }
};
