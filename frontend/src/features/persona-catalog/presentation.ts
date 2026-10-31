/**
 * Safe presentation entry for the persona catalog (spec-23).
 *
 * Demo adapters import this module, never the live client/hook barrel. It
 * contains only pure, data-shape-agnostic screens and view types.
 */
export {
    RosterList,
    type RosterHrefs,
    type RosterListProps,
    type RosterPersonaView,
} from "./presentation/roster-list";
