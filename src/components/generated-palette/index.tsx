import PaletteSwatch from "~/components/palette-swatch";
import SectionHeading from "~/components/section-heading";
import { classes } from "./style.st.css";
import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import PaletteTexturePreview from "../palette-texture-preview";

const GeneratedPalette = () => {

    const { colors } = useGradientGenerator();

    return (
        <section class={classes.root}>

            <SectionHeading title="Generated palette" />

            <PaletteTexturePreview colors={colors.value} />

            <div class={classes.swatchGrid}>
                {colors.value.map((color, index) => <PaletteSwatch color={color} key={`${color.hex}-${index}`} />)}
            </div>

        </section>
    );
};

export default GeneratedPalette;
