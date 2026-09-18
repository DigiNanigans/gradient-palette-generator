import { useEffect, useRef } from "preact/hooks";
import { useToast } from "~/hooks/use-toast";
import type { ColorDetails } from "~/lib/colors";
import { classes } from "./style.st.css";

const getPngBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to encode palette PNG"));
    }, "image/png");
});

const PaletteTexturePreview = (props: { colors: ColorDetails[] }) => {
    const canvas = useRef<HTMLCanvasElement>(null);
    const { notify } = useToast();

    useEffect(() => {
        const element = canvas.current;
        if (!element) return;

        element.width = Math.max(props.colors.length, 1);
        element.height = 1;

        const context = element.getContext("2d");
        if (!context) return;

        props.colors.forEach((color, index) => {
            context.fillStyle = color.hex;
            context.fillRect(index, 0, 1, 1);
        });
    }, [props.colors]);

    const copyTexture = async () => {
        const element = canvas.current;

        try {
            if (!element || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
                throw new Error("Image clipboard unavailable");
            }

            const blob = await getPngBlob(element);
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            notify(`${props.colors.length} × 1 palette PNG copied`, { tone: "success" });
        } catch {
            notify("Image clipboard unavailable", { tone: "error" });
        }
    };

    return (
        <button
            class={classes.root}
            type="button"
            title={`Copy ${props.colors.length} × 1 palette PNG`}
            onClick={copyTexture}
        >
            <canvas ref={canvas} class={classes.preview} />
            <span class={classes.details}>
                <span class={classes.label}>Palette texture</span>
                <span class={classes.dimensions}>{props.colors.length} × 1 PNG · Click to copy</span>
            </span>
        </button>
    );
};

export default PaletteTexturePreview;
