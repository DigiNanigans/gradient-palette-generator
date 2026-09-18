import { describeColor, type HueMethod, type InterpolationSpace } from "~/lib/colors";
import { classes, st, vars } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import SectionHeading from "../section-heading";
import { useComputed, useSignal } from "@preact/signals";
import EasingCurveControl from "../easing-curve-control";
import PaletteHueMap from "../palette-hue-map";

const SPACE_OPTIONS: Array<{ value: InterpolationSpace; label: string }> = [
    { value: "oklch", label: "OKLCH" },
    { value: "lch", label: "LCH" },
    { value: "oklab", label: "OKLAB" },
    { value: "lab", label: "LAB" },
    { value: "hsl", label: "HSL" },
    { value: "hwb", label: "HWB" },
    { value: "srgb", label: "sRGB" },
];

const BlendSettings = () => {

    const { colors, stops, stepCount, minStepCount, maxStepCount, space, hue, setStepCount, setSpace, setHue } = useGradientGenerator();
    const rangeProgress = useComputed(() => maxStepCount === minStepCount.value ? 100 : ((stepCount.value - minStepCount.value) / (maxStepCount - minStepCount.value)) * 100);
    const sourceColors = useComputed(() => stops.value.map(({ color }) => describeColor(color)));
    const showEasingControls = useSignal(false);
    const showHueMap = useSignal(false);

    return (
        <section class={classes.root}>

            <SectionHeading title="Blend settings" />

            <div class={classes.card}>

                <label class={st(classes.control, {wide: true})}>
                    <span class={classes.label}>Steps <strong>{stepCount.value}</strong></span>
                    <input
                        class={classes.range}
                        type="range"
                        min={minStepCount.value}
                        max={maxStepCount}
                        value={stepCount.value}
                        disabled={minStepCount.value === maxStepCount}
                        style={{[vars.rangeProgress]: `${rangeProgress.value}%` }}
                        onInput={(event) => setStepCount(event.currentTarget.valueAsNumber)}
                    />
                    <span class={classes.rangeBounds}><span>{minStepCount.value}</span><span>{maxStepCount}</span></span>
                </label>

                <label class={classes.control}>
                    <span class={classes.label}>Colour space</span>
                    <select value={space.value} onChange={(event) => setSpace(event.currentTarget.value as InterpolationSpace)}>
                        {SPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                    </select>
                </label>

                <label class={classes.control}>
                    <span class={classes.label}>Hue path</span>
                    <select value={hue.value} onChange={(event) => setHue(event.currentTarget.value as HueMethod)}>
                        <option value="shorter">Shorter</option>
                        <option value="longer">Longer</option>
                    </select>
                </label>

                <div class={classes.panelToggles}>
                    <button type="button" class={st(classes.panelToggle, { expanded: showEasingControls.value })} title={showEasingControls.value ? "Hide easing controls" : "Show easing controls"}
                        onClick={() => showEasingControls.value = !showEasingControls.value}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M3 18c5 0 4-12 10-12s5 12 8 12" />
                            <circle cx="1" cy="19" r="1.5" />
                            <circle cx="13" cy="4" r="1.5" />
                            <circle cx="23" cy="19" r="1.5" />
                        </svg>
                    </button>

                    <button type="button" class={st(classes.panelToggle, { expanded: showHueMap.value })} title={showHueMap.value ? "Hide hue map" : "Show hue map"}
                        onClick={() => showHueMap.value = !showHueMap.value}
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="6" cy="16" r="2" />
                            <circle cx="12" cy="10" r="2" />
                            <circle cx="18" cy="6" r="2" />
                            <path d="M3 20h18M3 20V3" />
                        </svg>
                    </button>
                </div>

                <div class={classes.panelRow} hidden={!showEasingControls.value}>
                    <EasingCurveControl />
                </div>

                <div class={classes.panelRow} hidden={!showHueMap.value}>
                    <PaletteHueMap colors={colors.value} sourceColors={sourceColors.value} />
                </div>

            </div>

        </section>
    )
}

export default BlendSettings;
