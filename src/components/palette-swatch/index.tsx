import type { ColorDetails } from "~/lib/colors";
import { classes, st } from "./style.st.css";
import { useToast } from "~/hooks/use-toast";

const PaletteSwatch = (props: {
    color: ColorDetails;
    selected?: boolean;
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
        <button class={st(classes.root, { selected: props.selected })} type="button" onClick={copyColor} title={`Copy ${props.color.hex}`}>
            <span class={classes.color} style={{ background: props.color.hex }} />
            <span class={classes.hex}>
                {props.color.hex}
            </span>
        </button>
    );

}

export default PaletteSwatch;
