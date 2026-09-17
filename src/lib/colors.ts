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

type CurvePoint = { x: number; y: number };

const createMonotoneCurve = (points: CurvePoint[]) => {
    const widths = points.slice(0, -1).map((point, index) => points[index + 1].x - point.x);
    const slopes = widths.map((width, index) => (points[index + 1].y - points[index].y) / width);
    const tangents = points.map((_, index) => {
        if (index === 0) return slopes[0];
        if (index === points.length - 1) return slopes[slopes.length - 1];
        return (slopes[index - 1] + slopes[index]) / 2;
    });

    slopes.forEach((slope, index) => {
        if (slope === 0) {
            tangents[index] = 0;
            tangents[index + 1] = 0;
            return;
        }

        const startRatio = tangents[index] / slope;
        const endRatio = tangents[index + 1] / slope;
        const magnitude = Math.hypot(startRatio, endRatio);

        if (magnitude > 3) {
            const scale = 3 / magnitude;
            tangents[index] = scale * startRatio * slope;
            tangents[index + 1] = scale * endRatio * slope;
        }
    });

    return (value: number) => {
        const position = clamp(value, 0, 1);
        const upperIndex = points.findIndex((point) => point.x >= position);
        if (upperIndex <= 0) return points[0].y;

        const lowerIndex = upperIndex - 1;
        const width = widths[lowerIndex];
        const localPosition = width === 0 ? 0 : (position - points[lowerIndex].x) / width;
        const squared = localPosition * localPosition;
        const cubed = squared * localPosition;
        const startBasis = (2 * cubed) - (3 * squared) + 1;
        const startTangentBasis = cubed - (2 * squared) + localPosition;
        const endBasis = (-2 * cubed) + (3 * squared);
        const endTangentBasis = cubed - squared;

        return clamp(
            (startBasis * points[lowerIndex].y)
            + (startTangentBasis * width * tangents[lowerIndex])
            + (endBasis * points[upperIndex].y)
            + (endTangentBasis * width * tangents[upperIndex]),
            0,
            1,
        );
    };
};

export const createGradientPositionMapper = (
    sourceCount: number,
    steps: number,
    easing: CubicBezierCurve,
    snapToSourceColors = false,
) => {
    const rangeCount = Math.max(sourceCount - 1, 1);
    const getAuthoredPosition = (progress: number) => {
        const position = clamp(progress, 0, 1) * rangeCount;
        const rangeIndex = Math.min(Math.floor(position), rangeCount - 1);
        const localPosition = Math.min(position - rangeIndex, 1);
        return (rangeIndex + applyCubicBezier(localPosition, easing)) / rangeCount;
    };

    if (!snapToSourceColors || sourceCount <= 2 || steps < sourceCount) {
        return getAuthoredPosition;
    }

    const fitPoints: CurvePoint[] = [{ x: 0, y: 0 }];
    let previousStep = 0;

    for (let sourceIndex = 1; sourceIndex < sourceCount - 1; sourceIndex += 1) {
        const expectedPosition = sourceIndex / rangeCount;
        const lastAvailableStep = steps - sourceCount + sourceIndex;
        let nearestStep = previousStep + 1;
        let nearestPosition = getAuthoredPosition(nearestStep / (steps - 1));
        let nearestDistance = Math.abs(nearestPosition - expectedPosition);

        for (let stepIndex = previousStep + 2; stepIndex <= lastAvailableStep; stepIndex += 1) {
            const stepPosition = getAuthoredPosition(stepIndex / (steps - 1));
            const distance = Math.abs(stepPosition - expectedPosition);

            if (distance < nearestDistance) {
                nearestStep = stepIndex;
                nearestPosition = stepPosition;
                nearestDistance = distance;
            }
        }

        fitPoints.push({ x: nearestPosition, y: expectedPosition });
        previousStep = nearestStep;
    }

    fitPoints.push({ x: 1, y: 1 });
    const applyBestFit = createMonotoneCurve(fitPoints);
    return (progress: number) => applyBestFit(getAuthoredPosition(progress));
};

export const createPalette = (
    sourceColors: string[],
    steps: number,
    space: InterpolationSpace,
    hue: HueMethod,
    easing: CubicBezierCurve = LINEAR_EASING_CURVE,
    snapToSourceColors = false,
) => {
    if (sourceColors.length < 2) return sourceColors.map((color) => new Color(color));
    const ranges = sourceColors.slice(0, -1).map((color, index) => new Color(color).range(
        new Color(sourceColors[index + 1]),
        { space, hue, outputSpace: "srgb" },
    ));
    const getGradientPosition = createGradientPositionMapper(
        sourceColors.length,
        steps,
        easing,
        snapToSourceColors,
    );

    return Array.from({ length: steps }, (_, index) => {
        const position = getGradientPosition(index / Math.max(steps - 1, 1)) * ranges.length;
        const rangeIndex = Math.min(Math.floor(position), ranges.length - 1);
        const localPosition = Math.min(position - rangeIndex, 1);
        return ranges[rangeIndex](localPosition).toGamut("srgb").to("srgb");
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
