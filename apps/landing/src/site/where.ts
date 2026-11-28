import { createContext, useContext } from "react";

/** The address of the page on screen ("/" on the home page), for the links that depend on where you are. */
export const PathContext = createContext("/");
export const usePath = () => useContext(PathContext);

/** A link to a section of the home page: a jump within it on the home page, the home page from anywhere else. */
export const homeLink = (path: string, hash: string) => (path === "/" ? hash : `/${hash}`);
