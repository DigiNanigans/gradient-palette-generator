import { render, options, Signalish } from "preact";
import { ErrorBoundary } from "preact-iso";
import "./main.st.css";
import "./project.st.css";
import Home from "~/routes/index";
import Layout from "~/components/layout";

type ClassType = Signalish<string | undefined>

options.vnode = vnode => {
    const isObject = vnode.props && (typeof vnode.props === 'object');

    let className: ClassType | Array<ClassType | undefined>;

    if (isObject && ("class" in vnode.props)) {
        className = vnode.props.class as Signalish<string | undefined> | Array<string | undefined>;
        delete vnode.props.class;
    } else if (isObject && ("className" in vnode.props)) {
        className = vnode.props.className as Signalish<string | undefined> | Array<string | undefined>; 
    }

    if (!className) return;

    if (!(typeof className === 'string')) {
        if ('value' in className) className = className.value;
        if (Array.isArray(className)) className = className.filter(Boolean).join(" ");
    }

    if (!className) return;

    Object.assign(vnode.props, {
        className,
    })
};

const App = () => {

    return (
        <Layout>

            <ErrorBoundary>
                <Home />
            </ErrorBoundary>

        </Layout>
    );
}

const root = document.getElementById("root");

if (root) {
    render(<App />, root);
} else {
    throw new Error("Root element not found");
}
