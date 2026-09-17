import BlendSettings from "~/components/blend-settings";
import GeneratedPalette from "~/components/generated-palette";
import Grid from "~/components/grid";
import PageHeader from "~/components/page-header";
import SourceColors from "~/components/source-colors";
import { GradientGenProvider } from "~/hooks/use-gradient-generator";

const Home = () => {

    return (
        <GradientGenProvider>
            
            <PageHeader title="Gradient Palette Generator" />

            <Grid>
                <SourceColors />

                <Grid.Col>
                    <BlendSettings />
                    <GeneratedPalette />
                </Grid.Col>

            </Grid>

        </GradientGenProvider>
    );
};

export default Home;
