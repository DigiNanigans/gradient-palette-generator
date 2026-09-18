import { useGradientGenerator } from "~/hooks/use-gradient-generator";
import { useToast } from "~/hooks/use-toast";
import { classes } from "./style.st.css";

const copyText = async (value: string) => {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return;
        } catch {
            // Fall through for browsers that expose the API but deny access.
        }
    }

    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();

    const copied = document.execCommand("copy");
    field.remove();

    if (!copied) throw new Error("Clipboard unavailable");
};

const SharePaletteButton = () => {
    const { getShareUrl } = useGradientGenerator();
    const { notify } = useToast();

    const copyShareLink = async () => {
        try {
            await copyText(getShareUrl());
            notify("Palette link copied", { tone: "success" });
        } catch {
            notify("Unable to copy palette link", { tone: "error" });
        }
    };

    return (
        <button class={classes.root} type="button" onClick={copyShareLink} title="Copy palette share link">
            <svg viewBox="0 0 24 24">
                <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
            </svg>
            <span>Share</span>
        </button>
    );
};

export default SharePaletteButton;
