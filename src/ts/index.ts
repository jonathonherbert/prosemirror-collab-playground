import { Node } from "prosemirror-model";
import {
  EditorState,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  Transaction,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import "../css/index.scss";

type ClientID = string;
interface PluginState {
  // Do we need to store this in the plugin? Possibly not;
  // and we must maintain them alongside decorations, which
  // is an opportunity for us to come out of sync.
  selections: Map<ClientID, UserSelectionChange>;
  // We keep track of all the clientIDs to ensure we generate
  // a distinct color for each of them.
  clientIDs: Set<ClientID>;
  decorations: DecorationSet;
  // We maintain a selection version to allow clients to avoid
  // redundant or misleading updates.
  version: number;
}

interface UserSelectionChange {
  selection: Selection | undefined;
  clientID: string;
  userName: string;
  version: number;
}

type SELECTION_CHANGED_ACTION = "SELECTION_CHANGED_ACTION";

export const actionSelectionsChanged = (payload: UserSelectionChange[]) => ({
  type: "SELECTION_CHANGED_ACTION" as SELECTION_CHANGED_ACTION,
  payload,
});

export const COLLAB_ACTION = "COLLAB_ACTION";

const pluginKey = new PluginKey("selection-collab");
export const getSelectionVersion = (state: EditorState) =>
  pluginKey.getState(state).version;

export const createSelectionCollabPlugin = (clientID: string) => {
  const plugin: Plugin<PluginState> = new Plugin<PluginState>({
    key: pluginKey,
    state: {
      init() {
        return {
          selections: new Map(),
          clientIDs: new Set(),
          decorations: new DecorationSet(),
          version: 0,
        };
      },
      apply(tr, pluginState, oldState, newState) {
        const action = tr.getMeta(COLLAB_ACTION);
        const version = getNewSelectionVersion(
          tr,
          pluginState,
          oldState,
          newState
        );

        const mappedDecos = pluginState.decorations.map(
          tr.mapping,
          newState.doc
        );

        const newPluginState = {
          ...pluginState,
          version,
          decorations: mappedDecos,
        };
        if (!action) {
          return newPluginState;
        }

        const specs = action.payload as UserSelectionChange[];
        return specs
          .filter(shouldApplyIncomingSelection(clientID, newPluginState))
          .reduce((localPluginState, spec) => {
            return getStateForNewUserSelection(
              newState.doc,
              localPluginState,
              spec
            );
          }, newPluginState);
      },
    },
    props: {
      decorations(state) {
        return plugin.getState(state).decorations;
      },
    },
  });

  return plugin;
};

const shouldApplyIncomingSelection = (clientID: string, state: PluginState) => (
  selectionChanges: UserSelectionChange
) => {
  const isOwnClientID = selectionChanges.clientID === clientID;
  if (isOwnClientID) {
    return false;
  }
  const currentVersion =
    state.selections.get(selectionChanges.clientID)?.version ?? -1;
  const incomingVersionIsFresh = currentVersion < selectionChanges.version;

  return incomingVersionIsFresh;
};

const getStateForNewUserSelection = (
  doc: Node,
  oldState: PluginState,
  selection: UserSelectionChange
): PluginState => {
  if (!(selection.selection instanceof TextSelection)) {
    console.log(`Selection not yet supported`);
  }
  // Any previous selection by the incoming clientID will now be invalid
  let newSels = new Map(oldState.selections).set(selection.clientID, selection);
  let newDecSet = oldState.decorations.remove(
    oldState.decorations.find(
      undefined,
      undefined,
      (spec) => spec.clientID === selection.clientID
    )
  );

  if (!selection.selection) {
    // There's nothing to add.
    return {
      ...oldState,
      decorations: newDecSet,
      selections: newSels,
      clientIDs: oldState.clientIDs,
    };
  }

  const newClientIDs = oldState.clientIDs.add(selection.clientID);
  const decorations = getDecosForSelection(
    doc,
    selection.userName,
    selection.clientID,
    selection.selection,
    newClientIDs
  );
  newDecSet = newDecSet.add(doc, decorations);

  return {
    ...oldState,
    decorations: newDecSet,
    selections: newSels,
    clientIDs: newClientIDs,
  };
};

const getDecosForSelection = (
  doc: Node,
  userName: string,
  clientID: ClientID,
  { head, from, to, empty }: Selection,
  clientIDs: Set<ClientID>
): Decoration[] => {
  const clientIDIndex = Array.from(clientIDs).indexOf(clientID);

  const cursorColor = selectColor(clientIDIndex);
  const cursorDeco = getCursorDeco(head, clientID, userName, cursorColor);

  const selectionColor = selectColor(clientIDIndex, true);
  const selectionDeco = empty
    ? undefined
    : getSelectionDeco(from, to, clientID, selectionColor);

  return [cursorDeco, selectionDeco].filter(notEmpty);
};

const getCursorDeco = (
  pos: number,
  clientID: ClientID,
  userName: string,
  color: string
): Decoration => {
  const getDOMNode = () => {
    const containerEl = document.createElement("span");
    containerEl.classList.add("SelectionCollab__caret-widget-container");
    containerEl.style.boxShadow = `0px 2px 0 1px ${color}`;

    const userNameEl = document.createElement("span");
    userNameEl.classList.add("SelectionCollab__caret-widget-user-name");
    userNameEl.style.backgroundColor = color;
    userNameEl.innerText = userName;
    containerEl.appendChild(userNameEl);

    return containerEl;
  };
  return Decoration.widget(pos, getDOMNode, { clientID });
};

const getSelectionDeco = (
  from: number,
  to: number,
  clientID: ClientID,
  color: string
): Decoration =>
  Decoration.inline(
    from,
    to,
    {
      class: "SelectionCollab__selection-widget",
      style: `background-color: ${color}`,
    },
    {
      clientID,
    }
  );

const notEmpty = <TValue>(
  value: TValue | null | undefined
): value is TValue => {
  return value !== null && value !== undefined;
};

const selectColor = (index: number, isBackground = false) => {
  const hue = index * 137.508; // use golden angle approximation
  return `hsl(${hue},50%,${isBackground ? 90 : 50}%)`;
};

const getNewSelectionVersion = (
  tr: Transaction,
  pluginState: PluginState,
  oldState: EditorState,
  newState: EditorState
) => {
  const selectionChanged = oldState.selection !== newState.selection;
  // Do not increment a version in response to a change in the
  // remote cursor state – it shouldn't affect anything locally.
  const shouldIgnore = !!tr.getMeta(COLLAB_ACTION);
  return selectionChanged && !shouldIgnore
    ? pluginState.version + 1
    : pluginState.version;
};
