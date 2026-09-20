import { useSignal, useSignalEffect } from "@preact/signals";

const readSessionKey = (key: string, fallback: boolean) => {
    const storedValue = window.sessionStorage.getItem(key);
    return storedValue === null ? fallback : storedValue === "true";
};

export const useSessionStore = (key: string, fallback = false) => {
    const value = useSignal(readSessionKey(key, fallback));

    useSignalEffect(() => {
        window.sessionStorage.setItem(key, String(value.value));
    });

    return value;
};
