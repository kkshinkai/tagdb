import type {Literal} from "mdast";

export interface RemarkTagdbOptions {
  tags?: ReadonlyArray<string> | ReadonlySet<string>;
}

export interface TagdbData {
  tags?: string[];
}

export interface TagdbTagNode extends Literal {
  type: "tagdbTag";
  value: string;
}
