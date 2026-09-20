import PaletteSwatch from "~/components/palette-swatch";
import SectionHeading from "~/components/section-heading";
import { classes } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import PaletteTexturePreview from "../palette-texture-preview";
import { getPaletteSourcePositions, getSnappedGeneratedIndexes } from "~/lib/colors";

const GeneratedPalette = () => {

    const { colors, stops, stepCount, space, hue, easing, snapToSourceColors, selectedPalettePoint } = useGradientGenerator();
    const selection = selectedPalettePoint.value;
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

    if (selection?.kind === "generated") {
        selectedIndex = selection.index;
    } else if (selection?.kind === "source") {
        selectedIndex = generatedIndexesBySource.get(selection.index);
    }

    return (
        <section class={classes.root}>

            <SectionHeading title="Generated palette" />

            <PaletteTexturePreview colors={colors.value} />

            <div class={classes.swatchGrid}>
                {colors.value.map((color, index) => (
                    <PaletteSwatch
                        color={color}
                        sourceIndex={sourceIndexesByGenerated.get(index)}
                        selected={index === selectedIndex}
                        key={`${color.hex}-${index}`}
                    />
                ))}
            </div>

        </section>
    );
};

export default GeneratedPalette;
