import type { ColorDetails } from "~/lib/colors";
import { classes } from "./style.st.css";
import { useToast } from "~/hooks/use-toast";

const PaletteSwatch = (props: {
    color: ColorDetails;
}) => {

    const { notify } = useToast();

    const copyColor = async () => {
        try {
            await navigator.clipboard.writeText(props.color.hex);
            notify(`${props.color.hex} copied`, { tone: "success" });
        } catch {
            notify("Clipboard unavailable", { tone: "error" });
        }
    };

    return (
        <button class={classes.root} type="button" onClick={copyColor} title={`Copy ${props.color.hex}`}>
            <span class={classes.color} style={{ background: props.color.hex }} />
            <span class={classes.hex}>
                {props.color.hex}
            </span>
        </button>
    );

}

export default PaletteSwatch;
