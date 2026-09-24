import type { Deduction } from "../core/analyze.ts";

export interface AidPresentation {
  text: string;
  detail: boolean;
  highlight: number[];
  conclusion: number[];
  target: number;
  kind: "safe" | "mine";
}

export function presentAid(step: Deduction, detail: boolean): AidPresentation {
  const kind = step.action === "reveal" ? "safe" : "mine";
  const clue = step.proof.clueCells[0];
  const clueValue = step.proof.inputSets[0]?.mines;
  const conclusion = step.proof.conclusion.cells;
  const target = step.index + 1;
  const verb = step.action === "reveal" ? "是安全的" : "一定是雷";

  if (!detail) {
    return {
      text: `第 ${target} 格${verb}`,
      detail,
      highlight: clue !== undefined ? [clue] : [],
      conclusion,
      target: step.index,
      kind,
    };
  }

  let text: string;
  switch (step.proof.technique) {
    case "direct-safe":
      text = `数字 ${clueValue} 周围的雷已经找齐，所以第 ${target} 格${verb}。`;
      break;
    case "direct-mine":
      text = `数字 ${clueValue} 周围剩下的未知格全是雷，第 ${target} 格也是。`;
      break;
    case "subset":
      text = `把两处数字的线索合起来，就能确定第 ${target} 格${verb}。`;
      break;
    case "overlap":
      text = `两处数字的线索重叠在一起，能确定第 ${target} 格${verb}。`;
      break;
    case "global-count":
      text =
        step.action === "reveal"
          ? `剩下的雷都找到了，所以第 ${target} 格${verb}。`
          : `剩下没揭开的格子全是雷，第 ${target} 格也是。`;
      break;
    default:
      text = `第 ${target} 格${verb}。`;
  }
  return { text, detail, highlight: clue !== undefined ? [clue] : [], conclusion, target: step.index, kind };
}

export const CONFLICT_TEXT = "你的某个标记可能有误，先看看标出的安全格。";
export const NO_AID_TEXT = "现在没有能确定的下一步，先自己试试吧。";
