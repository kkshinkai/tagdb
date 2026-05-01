import type {Literal} from "mdast";
import type {Point} from "unist";

export interface RemarkTagdbOptions {
  tags?: ReadonlyArray<string> | ReadonlySet<string>;
  properties?: ReadonlyArray<string> | ReadonlySet<string>;
}

export interface TagdbData {
  attachments?: TagdbAttachment[];
}

export interface TagdbTagNode extends Literal {
  type: "tagdbTag";
  value: string;
  data?: {
    tagdb?: {
      origin?: TagdbSourceRange;
    };
  };
}

export interface TagdbPropertyNode extends Literal {
  type: "tagdbProperty";
  value: string;
  data?: {
    tagdb?: {
      name?: string;
      origin?: TagdbSourceRange;
      raw?: string;
      value?: JsonValue;
      valueKind?: "scalar";
    };
  };
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {[key: string]: JsonValue};

export type TagdbAttachment = TagdbTagAttachment | TagdbPropertyAttachment;

export interface TagdbTagAttachment {
  kind: "tag";
  name: string;
  origin?: TagdbSourceRange;
  target?: TagdbSourceRange;
}

export interface TagdbPropertyAttachment {
  kind: "property";
  name: string;
  valueKind: "scalar";
  raw: string;
  value: JsonValue;
  origin?: TagdbSourceRange;
  target?: TagdbSourceRange;
}

export interface TagdbSourceRange {
  start: Point;
  end: Point;
}
