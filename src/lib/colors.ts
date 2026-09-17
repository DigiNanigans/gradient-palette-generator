import Color from "colorjs.io";
import { stVars } from "../project.st.css";

export type InterpolationSpace = "oklch" | "lch" | "oklab" | "lab" | "hsl" | "hwb" | "srgb";
export type HueMethod = "shorter" | "longer";
export type ColorDetails = { hex: string; rgb: string; hsl: string };
export type ContrastMode = "light" | "dark";
export type CubicBezierCurve = { x1: number; y1: number; x2: number; y2: number };

export const LINEAR_EASING_CURVE: CubicBezierCurve = {
    x1: 1 / 3,
    y1: 1 / 3,
    x2: 2 / 3,
    y2: 2 / 3,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, precision = 0) => {
    const multiplier = 10 ** precision;
    return Math.round(value * multiplier) / multiplier;
};

const cubicCoordinate = (position: number, firstControl: number, secondControl: number) => {
    const remaining = 1 - position;
    return (3 * remaining * remaining * position * firstControl)
        + (3 * remaining * position * position * secondControl)
        + (position * position * position);
};

const cubicDerivative = (position: number, firstControl: number, secondControl: number) => {
    const remaining = 1 - position;
    return (3 * remaining * remaining * firstControl)
        + (6 * remaining * position * (secondControl - firstControl))
        + (3 * position * position * (1 - secondControl));
};

export const applyCubicBezier = (progress: number, curve: CubicBezierCurve) => {
    const target = clamp(progress, 0, 1);
    if (target === 0 || target === 1) return target;

    let position = target;

    for (let iteration = 0; iteration < 8; iteration += 1) {
        const error = cubicCoordinate(position, curve.x1, curve.x2) - target;
        if (Math.abs(error) < 0.000001) {
            return clamp(cubicCoordinate(position, curve.y1, curve.y2), 0, 1);
        }

        const derivative = cubicDerivative(position, curve.x1, curve.x2);
        if (Math.abs(derivative) < 0.000001) break;
        position = clamp(position - (error / derivative), 0, 1);
    }

    let lower = 0;
    let upper = 1;

    for (let iteration = 0; iteration < 18; iteration += 1) {
        position = (lower + upper) / 2;
        if (cubicCoordinate(position, curve.x1, curve.x2) < target) lower = position;
        else upper = position;
    }

    return clamp(cubicCoordinate(position, curve.y1, curve.y2), 0, 1);
};

export const getContrastMode = (
    background: string,
    light = stVars.uiFgColor,
    dark = stVars.uiFgDark,
): ContrastMode => {
    const lightContrast = Color.contrastWCAG21(background, light);
    const darkContrast = Color.contrastWCAG21(background, dark);

    return lightContrast >= darkContrast ? "light" : "dark";
};

export const createPalette = (
    sourceColors: string[],
    steps: number,
    space: InterpolationSpace,
    hue: HueMethod,
    easing: CubicBezierCurve = LINEAR_EASING_CURVE,
) => {
    if (sourceColors.length < 2) return sourceColors.map((color) => new Color(color));
    const ranges = sourceColors.slice(0, -1).map((color, index) => new Color(color).range(
        new Color(sourceColors[index + 1]),
        { space, hue, outputSpace: "srgb" },
    ));

    return Array.from({ length: steps }, (_, index) => {
        const position = (index / Math.max(steps - 1, 1)) * ranges.length;
        const rangeIndex = Math.min(Math.floor(position), ranges.length - 1);
        const localPosition = Math.min(position - rangeIndex, 1);
        return ranges[rangeIndex](applyCubicBezier(localPosition, easing)).toGamut("srgb").to("srgb");
    });
};

export const describeColor = (color: Color): ColorDetails => {
    const srgb = color.to("srgb").toGamut("srgb");
    const [red, green, blue] = srgb.coords.map((coordinate) => Math.round(clamp(coordinate ?? 0, 0, 1) * 255));
    const [rawHue, saturation, lightness] = srgb.to("hsl").coords;
    const hue = typeof rawHue === "number" && Number.isFinite(rawHue) ? rawHue : 0;
    return {
        hex: srgb.toString({ format: "hex", collapse: false }).toUpperCase(),
        rgb: `${red}, ${green}, ${blue}`,
        hsl: `${round(hue, 1)}°, ${round(saturation ?? 0, 1)}%, ${round(lightness ?? 0, 1)}%`,
    };
};
