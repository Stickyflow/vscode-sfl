// "SFL: Apply Style Template": pick a template, rewrite the document's styles
// as one edit (a single undo step). Other extensions run it too: the preview's
// "Style" toolbar button calls it with the previewed document's URI.

import * as vscode from 'vscode';
import { applyStyleTemplate, detectTemplateId } from './applyStyleTemplate';
import { STYLE_TEMPLATES } from './styleTemplates';

export const APPLY_STYLE_TEMPLATE_COMMAND = 'sfl.applyStyleTemplate';

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

  const current = detectTemplateId(document.getText(), STYLE_TEMPLATES);
  const picked = await vscode.window.showQuickPick(
    STYLE_TEMPLATES.map((template) => ({
      label: template.label,
      description: template.id === current ? 'current' : undefined,
      detail: template.description,
      template,
    })),
    { title: 'Apply Style Template', placeHolder: 'Restyles every shape, container, table and link in this file' },
  );
  if (!picked) return;

  const result = applyStyleTemplate(document.getText(), picked.template);
  if (!result.ok) {
    void vscode.window.showErrorMessage(`Style template not applied: ${result.reason}`);
    return;
  }
  if (result.text === document.getText()) return;

  const edit = new vscode.WorkspaceEdit();
  const whole = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  edit.replace(document.uri, whole, result.text);
  if (await vscode.workspace.applyEdit(edit)) {
    vscode.window.setStatusBarMessage(`SFL: ${picked.template.label} applied to ${result.restyled} blocks`, 4000);
  }
}
