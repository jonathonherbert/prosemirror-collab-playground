import { EditorState, Selection, Transaction } from "prosemirror-state";
import { Step } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser, Node } from "prosemirror-model";
import { marks, schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { history } from "prosemirror-history";
import { exampleSetup, buildMenuItems } from "prosemirror-example-setup";

import "prosemirror-view/style/prosemirror.css";
import "prosemirror-menu/style/menu.css";
import "prosemirror-example-setup/style/style.css";
import "prosemirror-example-setup/style/style.css";
import {
  collab,
  receiveTransaction,
  sendableSteps,
  getVersion,
} from "prosemirror-collab";
import {
  COLLAB_ACTION,
  createSelectionCollabPlugin,
  actionSelectionsChanged,
  getSelectionVersion,
} from "../src/ts";

const getEditorTemplate = (id: number) => `
  <div id="editor-${id}" class="Editor" spellcheck="false">
    <div id="content-${id}" class="hide">
      <p>
        An example document, with
        <ul>
          <li>A few</li>
          <li>things</li>
          <li>in it.</li>
        </ul>
      </p>
    </div>
  </div>
`;

const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes as any, "paragraph block*", "block"),
  marks,
});

const historyPlugin = history();

const initialVersion = 0;

type StepsPayload = NonNullable<ReturnType<typeof sendableSteps>>;
type LocalStep = { step: Step; clientID: string };
type SelectionMap = Map<
  string,
  { selection: Selection | undefined; userName: string; version: number }
>;
class CollabServer {
  private version: number = 0;
  private steps: LocalStep[] = [];
  private doc: Node | undefined;
  private selections: SelectionMap = new Map();

  public init(doc: Node) {
    this.doc = doc;
  }

  public addSteps({ version, steps, clientID }: StepsPayload) {
    if (this.version !== version) return false;
    for (let i = 0; i < steps.length; i++) {
      this.doc = steps[i].apply(this.doc!).doc!;
    }
    this.version += steps.length;
    this.steps = this.steps.concat(
      steps.map((step) => ({ step, clientID: clientID.toString() }))
    );
  }

  public addSelection(
    selection: Selection,
    clientID: string,
    userName: string,
    version: number
  ) {
    this.selections.set(clientID, { userName, selection, version });
  }

  public getState(
    version: number
  ): { steps: LocalStep[]; selections: SelectionMap } | false {
    let startIndex = this.steps.length - (this.version - version);
    if (startIndex < 0) {
      return false;
    }

    return {
      steps: this.steps.slice(startIndex),
      selections: this.selections,
    };
  }
}

class EditorConnection {
  private state: EditorState;
  private lastSentSelection: Selection | undefined = undefined;

  constructor(
    private view: EditorView,
    private server: CollabServer,
    private clientID: string,
    private userName: string
  ) {
    this.state = view.state;
    view.setProps({
      dispatchTransaction: this.dispatchTransaction,
    });
    this.startPolling();
  }

  private dispatchTransaction = (transaction: Transaction) => {
    this.state = this.state.apply(transaction);
    const steps = sendableSteps(this.state);
    if (steps) {
      this.addStepsFromEditor(steps);
    }
    if (this.state.selection !== this.lastSentSelection) {
      this.addSelection(this.state.selection);
    }
    this.view.updateState(this.state);
  };

  private addStepsFromEditor(steps: StepsPayload) {
    this.server.addSteps(steps);
  }

  private addSelection(selection: Selection) {
    this.lastSentSelection = this.state.selection;
    const version = getSelectionVersion(this.state);
    this.server.addSelection(selection, this.clientID, this.userName, version);
  }

  public startPolling() {
    setInterval(() => {
      const version = getVersion(this.state);
      const state = server.getState(version);
      if (!state) {
        return console.log("Could not get steps on last poll");
      }
      const { steps, selections } = state;
      const tr = receiveTransaction(
        this.state,
        steps.map((s) => s.step),
        steps.map((s) => s.clientID)
      );
      const selectionSpecs = [...selections.entries()].map(
        ([clientID, { userName, selection, version }]) => ({
          clientID,
          userName,
          selection,
          version,
        })
      );
      tr.setMeta(COLLAB_ACTION, actionSelectionsChanged(selectionSpecs));
      console.log({ tr, selectionSpecs });
      this.dispatchTransaction(tr);
    }, 500);
  }
}

const appEl = document.getElementById("app-root");
const createEditors = (noOfEditors: number, server: CollabServer) =>
  Array(noOfEditors)
    .fill(undefined)
    .map((_, index) => {
      const editorNo = index + 1;

      const clientID = index.toString();
      const collabPlugin = collab({ version: initialVersion, clientID });
      const editorNode = document.createElement("div");
      editorNode.classList.add("Editor__container");
      editorNode.innerHTML = getEditorTemplate(editorNo);
      appEl?.appendChild(editorNode);

      const contentElement = document.getElementById(`content-${editorNo}`);
      const doc = DOMParser.fromSchema(mySchema).parse(contentElement!);
      if (contentElement && contentElement.parentElement) {
        contentElement.parentElement.removeChild(contentElement);
      }
      const view = new EditorView(
        document.getElementById(`editor-${editorNo}`)!,
        {
          state: EditorState.create({
            doc,
            plugins: [
              ...exampleSetup({
                schema: mySchema,
                history: false,
                menuContent: buildMenuItems(mySchema).fullMenu,
              }),
              collabPlugin,
              historyPlugin,
              createSelectionCollabPlugin(clientID),
            ],
          }),
        }
      );

      (window as any)[`connection${editorNo}`] = new EditorConnection(
        view,
        server,
        clientID,
        `User ${clientID}`
      );
      return view;
    });

const server = new CollabServer();
const editors = createEditors(4, server);
const doc = editors[0].state.doc;
server.init(doc);

// Handy debugging tools
(window as any).server = server;
(window as any).editors = editors;
(window as any).ProseMirrorDevTools.applyDevTools(editors[0], { EditorState });
