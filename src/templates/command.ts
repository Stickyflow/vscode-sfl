// "SFL: Apply Style Template": pick a template, rewrite the document's styles
// as one edit (a single undo step). Other extensions run it too: the preview's
// "Style" toolbar button calls it with the previewed document's URI. When the
// document has a template, the last entry removes it instead.
//
// While the picker is open, the highlighted entry is shown live in the
// document's preview (vscode-sfl-preview's TRANSIENT_SOURCE_COMMAND) without
// editing the document; closing the picker without a pick shows the
// document again.

import * as vscode from 'vscode';
import { applyStyleTemplate, detectTemplateId } from './applyStyleTemplate';
import { removeStyleTemplate } from './removeStyleTemplate';
import { STYLE_TEMPLATES, type StyleTemplate } from './styleTemplates';

export const APPLY_STYLE_TEMPLATE_COMMAND = 'sfl.applyStyleTemplate';
/** Registered by vscode-sfl-preview: `(uri, source | null)`. */
const TRANSIENT_SOURCE_COMMAND = 'sfl.preview.showTransientSource';

/** What a picker entry does: apply one template, or remove the current one. */
type Action = { kind: 'apply'; template: StyleTemplate } | { kind: 'remove' };

/** The new text and the status-bar line for it, or why there is none. */
type Outcome = { ok: true; text: string; status: string } | { ok: false; reason: string };

interface ActionItem extends vscode.QuickPickItem {
  action: Action;
}

export function registerStyleTemplateCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand(APPLY_STYLE_TEMPLATE_COMMAND, applyCommand));
}

async function applyCommand(target?: vscode.Uri): Promise<void> {
  const document = target
    ? await vscode.workspace.openTextDocument(target)
    : vscode.window.activeTextEditor?.document;
  if (!document || document.languageId !== 'sfl') {
    void vscode.window.showWarningMessage('Open an .sfl file to apply a style template.');
    return;
  }

  const original = document.getText();
  const outcomes = new Map<Action, Outcome>();
  const outcomeOf = (action: Action) => {
    let outcome = outcomes.get(action);
    if (!outcome) {
      outcome = run(original, action);
      outcomes.set(action, outcome);
    }
    return outcome;
  };
  const showInPreview = (source: string | null) => {
    // Fails harmlessly when the preview extension isn't installed.
    Promise.resolve(vscode.commands.executeCommand(TRANSIENT_SOURCE_COMMAND, document.uri, source)).catch(() => undefined);
  };

  const hasTemplate = /\bStyle\s+tpl_\w+/.test(original);
  const picked = await pick(detectTemplateId(original, STYLE_TEMPLATES), hasTemplate, (action) => {
    const outcome = outcomeOf(action);
    showInPreview(outcome.ok ? outcome.text : null);
  });
  if (!picked) {
    showInPreview(null);
    return;
  }

  const outcome = outcomeOf(picked);
  if (!outcome.ok) {
    showInPreview(null);
    void vscode.window.showErrorMessage(`Style template not changed: ${outcome.reason}`);
    return;
  }
  if (document.getText() !== original) {
    // Edited while the picker was open: the cached result would drop that edit.
    showInPreview(null);
    void vscode.window.showWarningMessage('The file changed while picking a template. Please try again.');
    return;
  }
  if (outcome.text === original) return;

  const edit = new vscode.WorkspaceEdit();
  const whole = new vscode.Range(document.positionAt(0), document.positionAt(original.length));
  edit.replace(document.uri, whole, outcome.text);
  if (await vscode.workspace.applyEdit(edit)) {
    vscode.window.setStatusBarMessage(outcome.status, 4000);
  } else {
    showInPreview(null);
  }
}

function run(source: string, action: Action): Outcome {
  if (action.kind === 'remove') {
    const result = removeStyleTemplate(source);
    return result.ok ? { ok: true, text: result.text, status: `SFL: style template removed from ${result.unstyled} blocks` } : result;
  }
  const result = applyStyleTemplate(source, action.template);
  if (!result.ok) return result;
  const branches = result.branches > 0 ? `, ${result.branches} yes/no branch nodes added` : '';
  return { ok: true, text: result.text, status: `SFL: ${action.template.label} applied to ${result.restyled} blocks${branches}` };
}

/** Resolves to the accepted action, or undefined when the picker is dismissed. */
function pick(current: string | undefined, hasTemplate: boolean, onHighlight: (action: Action) => void): Promise<Action | undefined> {
  const items: Array<ActionItem | vscode.QuickPickItem> = STYLE_TEMPLATES.map((template) => ({
    label: template.label,
    description: template.id === current ? 'current' : undefined,
    detail: template.description,
    action: { kind: 'apply', template },
  }));
  if (hasTemplate) {
    items.push(
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      {
        label: 'None',
        detail: 'Remove the template: deletes its tpl_* styles, so the file goes back to the default look',
        action: { kind: 'remove' },
      } satisfies ActionItem,
    );
  }
  const quickPick = vscode.window.createQuickPick<ActionItem>();
  quickPick.title = 'Apply Style Template';
  quickPick.placeholder = 'Restyles every shape, container, table and link in this file (shown live in the preview)';
  quickPick.matchOnDetail = true;
  quickPick.items = items as ActionItem[];
  const currentItem = (items as ActionItem[]).find((item) => item.action?.kind === 'apply' && item.action.template.id === current);
  if (currentItem) quickPick.activeItems = [currentItem];

  return new Promise((resolve) => {
    let accepted: Action | undefined;
    quickPick.onDidChangeActive(([item]) => {
      if (item?.action) onHighlight(item.action);
    });
    quickPick.onDidAccept(() => {
      accepted = (quickPick.selectedItems[0] ?? quickPick.activeItems[0])?.action;
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(accepted);
    });
    quickPick.show();
  });
}
