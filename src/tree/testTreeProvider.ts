import * as vscode from 'vscode';
import { TestCase, TestModel, TestStatus, TestSuite } from '../model/testModel';

export type TreeNode = SuiteNode | CaseNode;

export class SuiteNode extends vscode.TreeItem {
  constructor(public readonly suite: TestSuite) {
    super(suite.name, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'ztestSuite';
    this.iconPath = statusIcon(suite.status);
    this.description = statusLabel(suite.status);
    this.tooltip = suite.file
      ? `${suite.name} (${suite.cases.length} cases)\n${suite.file}:${suite.line ?? 1}`
      : `${suite.name} (${suite.cases.length} cases)`;
  }
}

export class CaseNode extends vscode.TreeItem {
  constructor(public readonly testCase: TestCase) {
    super(testCase.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'ztestCase';
    this.iconPath = statusIcon(testCase.status);
    this.description = statusLabel(testCase.status);
    this.tooltip = `${testCase.suite}.${testCase.name}\n${testCase.file}:${testCase.line}`;
    this.command = {
      command: 'ztest.openCase',
      title: 'Open Case',
      arguments: [this],
    };
  }
}

function statusLabel(status: TestStatus): string | undefined {
  switch (status) {
    case 'passed':
      return 'pass';
    case 'failed':
      return 'fail';
    case 'running':
      return 'running';
    case 'skipped':
      return 'skip';
    default:
      return undefined;
  }
}

function statusIcon(status: TestStatus): vscode.ThemeIcon {
  switch (status) {
    case 'passed':
      return new vscode.ThemeIcon(
        'pass',
        new vscode.ThemeColor('testing.iconPassed')
      );
    case 'failed':
      return new vscode.ThemeIcon(
        'error',
        new vscode.ThemeColor('testing.iconFailed')
      );
    case 'running':
      return new vscode.ThemeIcon('loading~spin');
    case 'skipped':
      return new vscode.ThemeIcon(
        'debug-step-over',
        new vscode.ThemeColor('testing.iconSkipped')
      );
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

export class TestTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly model: TestModel) {
    this.model.on('changed', () => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      return this.model.getSuites().map((s) => new SuiteNode(s));
    }
    if (element instanceof SuiteNode) {
      return element.suite.cases.map((c) => new CaseNode(c));
    }
    return [];
  }
}

export async function openTestLocation(
  file: string,
  line: number
): Promise<void> {
  const uri = vscode.Uri.file(file);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(
    new vscode.Range(pos, pos),
    vscode.TextEditorRevealType.InCenter
  );
}
