// Graphics on the local network (28 Nov). The engine listens on this PC only unless the producer lets other PCs
// load the graphics (Settings › Graphics); then other PCs may only read pages, never control Air.
export interface GraphicsLan { on: boolean; /** This PC's address on the network, when it has one. */ address: string | null }
export const GRAPHICS_LAN_OFF: GraphicsLan = { on: false, address: null };
export const LAN_SWITCH_LABEL = 'Let other PCs on this network load the graphics';
export const LAN_EXPLAIN = 'Lets OBS or vMix on another PC on your network show Air\u2019s graphics. Other PCs can only look at graphics; they cannot control Air.';
export const VMIX_LAN_WARNING = `vMix is on another PC \u2014 turn on \u201c${LAN_SWITCH_LABEL}\u201d in Settings`;
/** The address a page for another PC should use: this PC's network address only while the switch is on. */
export const pageHost = (lan: GraphicsLan | undefined) => (lan?.on && lan.address ? lan.address : '127.0.0.1');
