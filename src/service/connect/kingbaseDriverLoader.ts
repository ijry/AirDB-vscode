import { Global } from "@/common/global";

export type RuntimeRequire = (id: string) => any;

export const KINGBASE_DRIVER_RELATIVE_PATH = [
    "resources",
    "drivers",
    "kingbase",
    "node_modules",
    "kb",
];

function getRuntimeRequire(): RuntimeRequire {
    return eval("require") as RuntimeRequire;
}

export function getKingbaseDriverPath(): string {
    return Global.getExtPath(...KINGBASE_DRIVER_RELATIVE_PATH);
}

export function createMissingKingbaseDriverError(cause: unknown): Error {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new Error(
        `Kingbase official Nodejs driver is missing. Rebuild the extension with resources/drivers/kingbase/node_modules/kb. ${detail}`
    );
}

export function loadKingbaseDriverFromPath(
    driverPath: string,
    runtimeRequire: RuntimeRequire = getRuntimeRequire()
): any {
    try {
        const driver = runtimeRequire(driverPath);
        if (!driver || typeof driver.Client !== "function") {
            throw new Error("Driver did not export Client");
        }
        return driver;
    } catch (err) {
        throw createMissingKingbaseDriverError(err);
    }
}

export function loadKingbaseDriver(runtimeRequire?: RuntimeRequire): any {
    return loadKingbaseDriverFromPath(getKingbaseDriverPath(), runtimeRequire || getRuntimeRequire());
}
