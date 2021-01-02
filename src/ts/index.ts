import { Node } from "prosemirror-model";
import { Plugin, Selection, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import "../css/index.scss";

type ClientID = string;
interface PluginState {
  // Do we need to store this in the plugin? Possibly not;
  // and we must maintain them alongside decorations, which
  // is an opportunity for us to come out of sync.
  selections: UserSelectionChange[];
  // We keep track of all the clientIDs to ensure we generate
  // a distinct color for each of them.
  clientIDs: Set<ClientID>;
  decorations: DecorationSet;
}

interface UserSelectionChange {
  selection: Selection | undefined;
  clientID: string;
  userName: string;
}

type SELECTION_CHANGED_ACTION = "SELECTION_CHANGED_ACTION";

export const actionSelectionsChanged = (payload: UserSelectionChange[]) => ({
  type: "SELECTION_CHANGED_ACTION" as SELECTION_CHANGED_ACTION,
  payload,
});

export const COLLAB_ACTION = "COLLAB_ACTION";

export const createCollabCursorPlugin = (clientID: string) => {
  const plugin: Plugin<PluginState> = new Plugin<PluginState>({
    state: {
      init() {
        return {
          selections: [],
          clientIDs: new Set(),
          decorations: new DecorationSet(),
        };
      },
      apply(tr, pluginState, _oldState, newState) {
        const action = tr.getMeta(COLLAB_ACTION);
        const mappedDecos = pluginState.decorations.map(
          tr.mapping,
          newState.doc
        );

        const newPluginState = {
          ...pluginState,
          decorations: mappedDecos,
        };
        if (!action) {
          return newPluginState;
        }

        const specs = action.payload as UserSelectionChange[];

        return specs
          .filter((spec) => spec.clientID !== clientID)
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

const getStateForNewUserSelection = (
  doc: Node,
  oldState: PluginState,
  selection: UserSelectionChange
): PluginState => {
  if (!(selection.selection instanceof TextSelection)) {
    console.log(`Selection not yet supported`);
  }
  // Any previous selection by the incoming clientID will now be invalid
  let newSels = oldState.selections.filter(
    (_) => _.clientID !== selection.clientID
  );
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
    decorations: newDecSet,
    selections: newSels.concat(selection),
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
    containerEl.classList.add("CollabCursor__cursor-widget-container");
    containerEl.style.boxShadow = `0px 2px 0 1px ${color}`;

    const userNameEl = document.createElement("span");
    userNameEl.classList.add("CollabCursor__cursor-widget-user-name");
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
      class: "CollabCursor__selection-widget",
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
