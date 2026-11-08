import { useEffect, useState } from "react";
import { readStore, writeStore } from "./format";

export type ThemePref = "system" | "light" | "dark";
const KEY = "codelarpers:theme";

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => readStore(KEY, "system") as ThemePref);
  useEffect(() => {
    apply(pref);
    writeStore(KEY, pref);
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  return [pref, setPref];
}
