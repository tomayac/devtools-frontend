// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../../core/common/common.js';
import * as i18n from '../../core/i18n/i18n.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as DataGrid from '../../ui/legacy/components/data_grid/data_grid.js';
import * as Components from '../../ui/legacy/components/utils/utils.js';
import * as UI from '../../ui/legacy/legacy.js';
import * as ThemeSupport from '../../ui/legacy/theme_support/theme_support.js';

import {NetworkRequestNode, type NetworkNode} from './NetworkDataGridNode.js';
import {type NetworkLogView} from './NetworkLogView.js';
import {NetworkManageCustomHeadersView} from './NetworkManageCustomHeadersView.js';
import {
  type NetworkTimeCalculator,
  type NetworkTransferDurationCalculator,
  type NetworkTransferTimeCalculator,
} from './NetworkTimeCalculator.js';
import {NetworkWaterfallColumn} from './NetworkWaterfallColumn.js';
import {RequestInitiatorView} from './RequestInitiatorView.js';

const UIStrings = {
  /**
   *@description Data grid name for Network Log data grids
   */
  networkLog: 'Network Log',
  /**
   *@description Inner element text content in Network Log View Columns of the Network panel
   */
  waterfall: 'Waterfall',
  /**
   *@description A context menu item in the Network Log View Columns of the Network panel
   */
  responseHeaders: 'Response Headers',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  manageHeaderColumns: 'Manage Header Columns…',
  /**
   *@description Text for the start time of an activity
   */
  startTime: 'Start Time',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  responseTime: 'Response Time',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  endTime: 'End Time',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  totalDuration: 'Total Duration',
  /**
   *@description Text for the latency of a task
   */
  latency: 'Latency',
  /**
   *@description Text for the name of something
   */
  name: 'Name',
  /**
   *@description Text that refers to a file path
   */
  path: 'Path',
  /**
   *@description Text in Timeline UIUtils of the Performance panel
   */
  url: 'Url',
  /**
   *@description Text for one or a group of functions
   */
  method: 'Method',
  /**
   *@description Text for the status of something
   */
  status: 'Status',
  /**
   *@description Generic label for any text
   */
  text: 'Text',
  /**
   *@description Text for security or network protocol
   */
  protocol: 'Protocol',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  scheme: 'Scheme',
  /**
   *@description Text for the domain of a website
   */
  domain: 'Domain',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  remoteAddress: 'Remote Address',
  /**
   *@description Text that refers to some types
   */
  type: 'Type',
  /**
   *@description Text for the initiator of something
   */
  initiator: 'Initiator',
  /**
   *@description Column header in the Network log view of the Network panel
   */
  hasOverrides: 'Has overrides',
  /**
   *@description Column header in the Network log view of the Network panel
   */
  initiatorAddressSpace: 'Initiator Address Space',
  /**
   *@description Text for web cookies
   */
  cookies: 'Cookies',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  setCookies: 'Set Cookies',
  /**
   *@description Text for the size of something
   */
  size: 'Size',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  content: 'Content',
  /**
   *@description Text that refers to the time
   */
  time: 'Time',
  /**
   *@description Text to show the priority of an item
   */
  priority: 'Priority',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  connectionId: 'Connection ID',
  /**
   *@description Text in Network Log View Columns of the Network panel
   */
  remoteAddressSpace: 'Remote Address Space',
};
const str_ = i18n.i18n.registerUIStrings('panels/network/NetworkLogViewColumns.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);

export class NetworkLogViewColumns {
  private networkLogView: NetworkLogView;
  private readonly persistantSettings: Common.Settings.Setting<{
    [x: string]: {
      visible: boolean,
      title: string,
    },
  }>;
  private readonly networkLogLargeRowsSetting: Common.Settings.Setting<boolean>;
  private readonly eventDividers: Map<string, number[]>;
  private eventDividersShown: boolean;
  private gridMode: boolean;
  private columns: Descriptor[];
  private waterfallRequestsAreStale: boolean;
  private waterfallScrollerWidthIsStale: boolean;
  private readonly popupLinkifier: Components.Linkifier.Linkifier;
  private calculatorsMap: Map<string, NetworkTimeCalculator>;
  private lastWheelTime: number;
  private dataGridInternal!: DataGrid.SortableDataGrid.SortableDataGrid<NetworkNode>;
  private splitWidget!: UI.SplitWidget.SplitWidget;
  private waterfallColumn!: NetworkWaterfallColumn;
  private activeScroller!: Element;
  private dataGridScroller!: HTMLElement;
  private waterfallScroller!: HTMLElement;
  private waterfallScrollerContent!: HTMLDivElement;
  private waterfallHeaderElement!: HTMLElement;
  private waterfallColumnSortIcon!: UI.Icon.Icon;
  private activeWaterfallSortId!: string;
  private popoverHelper?: UI.PopoverHelper.PopoverHelper;
  private hasScrollerTouchStarted?: boolean;
  private scrollerTouchStartPos?: number;
  constructor(
      networkLogView: NetworkLogView, timeCalculator: NetworkTransferTimeCalculator,
      durationCalculator: NetworkTransferDurationCalculator,
      networkLogLargeRowsSetting: Common.Settings.Setting<boolean>) {
    this.networkLogView = networkLogView;

    this.persistantSettings = Common.Settings.Settings.instance().createSetting('networkLogColumns', {});

    this.networkLogLargeRowsSetting = networkLogLargeRowsSetting;
    this.networkLogLargeRowsSetting.addChangeListener(this.updateRowsSize, this);

    this.eventDividers = new Map();
    this.eventDividersShown = false;

    this.gridMode = true;

    this.columns = [];

    this.waterfallRequestsAreStale = false;
    this.waterfallScrollerWidthIsStale = true;

    this.popupLinkifier = new Components.Linkifier.Linkifier();

    this.calculatorsMap = new Map();
    this.calculatorsMap.set(_calculatorTypes.Time, timeCalculator);
    this.calculatorsMap.set(_calculatorTypes.Duration, durationCalculator);

    this.lastWheelTime = 0;

    this.setupDataGrid();
    this.setupWaterfall();

    ThemeSupport.ThemeSupport.instance().addEventListener(ThemeSupport.ThemeChangeEvent.eventName, () => {
      this.scheduleRefresh();
    });
  }

  private static convertToDataGridDescriptor(columnConfig: Descriptor): DataGrid.DataGrid.ColumnDescriptor {
    const title = columnConfig.title instanceof Function ? columnConfig.title() : columnConfig.title;
    return {
      id: columnConfig.id,
      title,
      sortable: columnConfig.sortable,
      align: columnConfig.align,
      nonSelectable: columnConfig.nonSelectable,
      weight: columnConfig.weight,
      allowInSortByEvenWhenHidden: columnConfig.allowInSortByEvenWhenHidden,
    } as DataGrid.DataGrid.ColumnDescriptor;
  }

  wasShown(): void {
    this.updateRowsSize();
  }

  willHide(): void {
    if (this.popoverHelper) {
      this.popoverHelper.hidePopover();
    }
  }

  reset(): void {
    if (this.popoverHelper) {
      this.popoverHelper.hidePopover();
    }
    this.eventDividers.clear();
  }

  private setupDataGrid(): void {
    const defaultColumns = _defaultColumns;
    const defaultColumnConfig = _defaultColumnConfig;
    this.columns = ([] as Descriptor[]);
    for (const currentConfigColumn of defaultColumns) {
      const descriptor = Object.assign({}, defaultColumnConfig, currentConfigColumn);
      const columnConfig = (descriptor as Descriptor);
      columnConfig.id = columnConfig.id;
      if (columnConfig.subtitle) {
        const title = columnConfig.title instanceof Function ? columnConfig.title() : columnConfig.title;
        const subtitle = columnConfig.subtitle instanceof Function ? columnConfig.subtitle() : columnConfig.subtitle;
        columnConfig.titleDOMFragment = this.makeHeaderFragment(title, subtitle);
      }
      this.columns.push(columnConfig);
    }
    this.loadCustomColumnsAndSettings();

    this.popoverHelper =
        new UI.PopoverHelper.PopoverHelper(this.networkLogView.element, this.getPopoverRequest.bind(this));
    this.popoverHelper.setHasPadding(true);
    this.popoverHelper.setTimeout(300, 300);
    this.dataGridInternal = new DataGrid.SortableDataGrid.SortableDataGrid<NetworkNode>(({
      displayName: (i18nString(UIStrings.networkLog) as string),
      columns: this.columns.map(NetworkLogViewColumns.convertToDataGridDescriptor),
      editCallback: undefined,
      deleteCallback: undefined,
      refreshCallback: undefined,
    }));
    this.dataGridInternal.element.addEventListener('mousedown', event => {
      if (!this.dataGridInternal.selectedNode && event.button) {
        event.consume();
      }
    }, true);
    this.dataGridScroller = (this.dataGridInternal.scrollContainer as HTMLDivElement);

    this.updateColumns();
    this.dataGridInternal.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this.sortHandler, this);
    this.dataGridInternal.setHeaderContextMenuCallback(this.innerHeaderContextMenu.bind(this));

    this.activeWaterfallSortId = WaterfallSortIds.StartTime;
    this.dataGridInternal.markColumnAsSortedBy(_initialSortColumn, DataGrid.DataGrid.Order.Ascending);

    this.splitWidget = new UI.SplitWidget.SplitWidget(true, true, 'networkPanelSplitViewWaterfall', 200);
    const widget = this.dataGridInternal.asWidget();
    widget.setMinimumSize(150, 0);
    this.splitWidget.setMainWidget(widget);
  }

  private setupWaterfall(): void {
    this.waterfallColumn = new NetworkWaterfallColumn(this.networkLogView.calculator());

    this.waterfallColumn.element.addEventListener('contextmenu', handleContextMenu.bind(this));
    this.waterfallColumn.element.addEventListener('wheel', this.onMouseWheel.bind(this, false), {passive: true});
    this.waterfallColumn.element.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.waterfallColumn.element.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.waterfallColumn.element.addEventListener('touchend', this.onTouchEnd.bind(this));

    this.dataGridScroller.addEventListener('wheel', this.onMouseWheel.bind(this, true), true);
    this.dataGridScroller.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.dataGridScroller.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.dataGridScroller.addEventListener('touchend', this.onTouchEnd.bind(this));
    this.waterfallScroller =
        (this.waterfallColumn.contentElement.createChild('div', 'network-waterfall-v-scroll') as HTMLDivElement);
    this.waterfallScrollerContent =
        (this.waterfallScroller.createChild('div', 'network-waterfall-v-scroll-content') as HTMLDivElement);

    this.dataGridInternal.addEventListener(DataGrid.DataGrid.Events.PaddingChanged, () => {
      this.waterfallScrollerWidthIsStale = true;
      this.syncScrollers();
    });
    this.dataGridInternal.addEventListener(
        DataGrid.ViewportDataGrid.Events.ViewportCalculated, this.redrawWaterfallColumn.bind(this));

    this.createWaterfallHeader();
    this.waterfallColumn.contentElement.classList.add('network-waterfall-view');

    this.waterfallColumn.setMinimumSize(100, 0);
    this.splitWidget.setSidebarWidget(this.waterfallColumn);

    this.switchViewMode(false);

    function handleContextMenu(this: NetworkLogViewColumns, ev: Event): void {
      const event = (ev as MouseEvent);
      const node = this.waterfallColumn.getNodeFromPoint(event.offsetX, event.offsetY);
      if (!node) {
        return;
      }
      const request = node.request();
      if (!request) {
        return;
      }
      const contextMenu = new UI.ContextMenu.ContextMenu(event);
      this.networkLogView.handleContextMenuForRequest(contextMenu, request);
      void contextMenu.show();
    }
  }

  private onMouseWheel(shouldConsume: boolean, ev: Event): void {
    if (shouldConsume) {
      ev.consume(true);
    }
    const event = (ev as WheelEvent);
    const hasRecentWheel = Date.now() - this.lastWheelTime < 80;
    this.activeScroller.scrollBy({top: event.deltaY, behavior: hasRecentWheel ? 'auto' : 'smooth'});
    this.syncScrollers();
    this.lastWheelTime = Date.now();
  }

  private onTouchStart(ev: Event): void {
    const event = (ev as TouchEvent);
    this.hasScrollerTouchStarted = true;
    this.scrollerTouchStartPos = event.changedTouches[0].pageY;
  }

  private onTouchMove(ev: Event): void {
    if (!this.hasScrollerTouchStarted) {
      return;
    }

    const event = (ev as TouchEvent);
    const currentPos = event.changedTouches[0].pageY;
    const delta = (this.scrollerTouchStartPos as number) - currentPos;

    this.activeScroller.scrollBy({top: delta, behavior: 'auto'});
    this.syncScrollers();

    this.scrollerTouchStartPos = currentPos;
  }

  private onTouchEnd(): void {
    this.hasScrollerTouchStarted = false;
  }

  private syncScrollers(): void {
    if (!this.waterfallColumn.isShowing()) {
      return;
    }
    this.waterfallScrollerContent.style.height =
        this.dataGridScroller.scrollHeight - this.dataGridInternal.headerHeight() + 'px';
    this.updateScrollerWidthIfNeeded();
    this.dataGridScroller.scrollTop = this.waterfallScroller.scrollTop;
  }

  private updateScrollerWidthIfNeeded(): void {
    if (this.waterfallScrollerWidthIsStale) {
      this.waterfallScrollerWidthIsStale = false;
      this.waterfallColumn.setRightPadding(
          this.waterfallScroller.offsetWidth - this.waterfallScrollerContent.offsetWidth);
    }
  }

  private redrawWaterfallColumn(): void {
    if (!this.waterfallRequestsAreStale) {
      this.updateScrollerWidthIfNeeded();
      this.waterfallColumn.update(
          this.activeScroller.scrollTop, this.eventDividersShown ? this.eventDividers : undefined);
      return;
    }
    this.syncScrollers();
    const nodes = this.networkLogView.flatNodesList();
    this.waterfallColumn.update(this.activeScroller.scrollTop, this.eventDividers, nodes);
  }

  private createWaterfallHeader(): void {
    this.waterfallHeaderElement =
        (this.waterfallColumn.contentElement.createChild('div', 'network-waterfall-header') as HTMLElement);
    this.waterfallHeaderElement.addEventListener('click', waterfallHeaderClicked.bind(this));
    this.waterfallHeaderElement.addEventListener(
        'contextmenu', event => this.innerHeaderContextMenu(new UI.ContextMenu.ContextMenu(event)));
    const innerElement = this.waterfallHeaderElement.createChild('div');
    innerElement.textContent = i18nString(UIStrings.waterfall);
    this.waterfallColumnSortIcon = UI.Icon.Icon.create('', 'sort-order-icon');
    this.waterfallHeaderElement.createChild('div', 'sort-order-icon-container')
        .appendChild(this.waterfallColumnSortIcon);

    function waterfallHeaderClicked(this: NetworkLogViewColumns): void {
      const sortOrders = DataGrid.DataGrid.Order;
      const wasSortedByWaterfall = this.dataGridInternal.sortColumnId() === 'waterfall';
      const wasSortedAscending = this.dataGridInternal.isSortOrderAscending();
      const sortOrder = wasSortedByWaterfall && wasSortedAscending ? sortOrders.Descending : sortOrders.Ascending;
      this.dataGridInternal.markColumnAsSortedBy('waterfall', sortOrder);
      this.sortHandler();
    }
  }

  setCalculator(x: NetworkTimeCalculator): void {
    this.waterfallColumn.setCalculator(x);
  }

  scheduleRefresh(): void {
    this.waterfallColumn.scheduleDraw();
  }
  private updateRowsSize(): void {
    const largeRows = Boolean(this.networkLogLargeRowsSetting.get());

    this.dataGridInternal.element.classList.toggle('small', !largeRows);
    this.dataGridInternal.scheduleUpdate();

    this.waterfallScrollerWidthIsStale = true;
    this.waterfallColumn.setRowHeight(largeRows ? 41 : 21);
    this.waterfallScroller.classList.toggle('small', !largeRows);
    this.waterfallHeaderElement.classList.toggle('small', !largeRows);

    // Request an animation frame because under certain conditions
    // (see crbug.com/1019723) this.waterfallScroller.offsetTop does
    // not return the value it's supposed to return as of the applied
    // css classes.
    window.requestAnimationFrame(() => {
      this.waterfallColumn.setHeaderHeight(this.waterfallScroller.offsetTop);
      this.waterfallColumn.scheduleDraw();
    });
  }

  show(element: Element): void {
    this.splitWidget.show(element);
  }

  setHidden(value: boolean): void {
    UI.ARIAUtils.setHidden(this.splitWidget.element, value);
  }

  dataGrid(): DataGrid.SortableDataGrid.SortableDataGrid<NetworkNode> {
    return this.dataGridInternal;
  }

  sortByCurrentColumn(): void {
    this.sortHandler();
  }

  private sortHandler(): void {
    const columnId = this.dataGridInternal.sortColumnId();
    this.networkLogView.removeAllNodeHighlights();
    this.waterfallRequestsAreStale = true;
    if (columnId === 'waterfall') {
      if (this.dataGridInternal.sortOrder() === DataGrid.DataGrid.Order.Ascending) {
        this.waterfallColumnSortIcon.setIconType('triangle-up');
      } else {
        this.waterfallColumnSortIcon.setIconType('triangle-down');
      }

      const sortFunction =
          (NetworkRequestNode.RequestPropertyComparator.bind(null, this.activeWaterfallSortId) as
               (arg0: DataGrid.SortableDataGrid.SortableDataGridNode<NetworkNode>,
                arg1: DataGrid.SortableDataGrid.SortableDataGridNode<NetworkNode>) => number);
      this.dataGridInternal.sortNodes(sortFunction, !this.dataGridInternal.isSortOrderAscending());
      this.dataGridSortedForTest();
      return;
    }
    this.waterfallColumnSortIcon.setIconType('');

    const columnConfig = this.columns.find(columnConfig => columnConfig.id === columnId);
    if (!columnConfig || !columnConfig.sortingFunction) {
      return;
    }
    const sortingFunction =
        (columnConfig.sortingFunction as
             ((arg0: DataGrid.SortableDataGrid.SortableDataGridNode<NetworkNode>,
               arg1: DataGrid.SortableDataGrid.SortableDataGridNode<NetworkNode>) => number) |
         undefined);
    if (!sortingFunction) {
      return;
    }
    this.dataGridInternal.sortNodes(sortingFunction, !this.dataGridInternal.isSortOrderAscending());
    this.dataGridSortedForTest();
  }

  private dataGridSortedForTest(): void {
  }

  private updateColumns(): void {
    if (!this.dataGridInternal) {
      return;
    }
    const visibleColumns = new Set<string>();
    if (this.gridMode) {
      for (const columnConfig of this.columns) {
        if (columnConfig.visible) {
          visibleColumns.add(columnConfig.id);
        }
      }
    } else {
      // Find the first visible column from the path group
      const visibleColumn = this.columns.find(c => c.hideableGroup === 'path' && c.visible);
      if (visibleColumn) {
        visibleColumns.add(visibleColumn.id);
      } else {
        // This should not happen because inside a hideableGroup
        // there should always be at least one column visible
        // This is just in case.
        visibleColumns.add('name');
      }
    }
    this.dataGridInternal.setColumnsVisiblity(visibleColumns);
  }

  switchViewMode(gridMode: boolean): void {
    if (this.gridMode === gridMode) {
      return;
    }
    this.gridMode = gridMode;

    if (gridMode) {
      this.splitWidget.showBoth();
      this.activeScroller = this.waterfallScroller;
      this.waterfallScroller.scrollTop = this.dataGridScroller.scrollTop;
      this.dataGridInternal.setScrollContainer(this.waterfallScroller);
    } else {
      this.networkLogView.removeAllNodeHighlights();
      this.splitWidget.hideSidebar();
      this.activeScroller = this.dataGridScroller;
      this.dataGridInternal.setScrollContainer(this.dataGridScroller);
    }
    this.networkLogView.element.classList.toggle('brief-mode', !gridMode);
    this.updateColumns();
    this.updateRowsSize();
  }

  private toggleColumnVisibility(columnConfig: Descriptor): void {
    this.loadCustomColumnsAndSettings();
    columnConfig.visible = !columnConfig.visible;
    this.saveColumnsSettings();
    this.updateColumns();
  }

  private saveColumnsSettings(): void {
    const saveableSettings: {
      // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [x: string]: any,
    } = {};
    for (const columnConfig of this.columns) {
      saveableSettings[columnConfig.id] = {visible: columnConfig.visible, title: columnConfig.title};
    }

    this.persistantSettings.set(saveableSettings);
  }

  private loadCustomColumnsAndSettings(): void {
    const savedSettings = this.persistantSettings.get();
    const columnIds = Object.keys(savedSettings);
    for (const columnId of columnIds) {
      const setting = savedSettings[columnId];
      let columnConfig = this.columns.find(columnConfig => columnConfig.id === columnId);
      if (!columnConfig) {
        columnConfig = this.addCustomHeader(setting.title, columnId) || undefined;
      }
      if (columnConfig && columnConfig.hideable && typeof setting.visible === 'boolean') {
        columnConfig.visible = Boolean(setting.visible);
      }
      if (columnConfig && typeof setting.title === 'string') {
        columnConfig.title = setting.title;
      }
    }
  }

  private makeHeaderFragment(title: string, subtitle: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    UI.UIUtils.createTextChild(fragment, title);
    const subtitleDiv = fragment.createChild('div', 'network-header-subtitle');
    UI.UIUtils.createTextChild(subtitleDiv, subtitle);
    return fragment;
  }

  private innerHeaderContextMenu(contextMenu: UI.ContextMenu.SubMenu): void {
    const columnConfigs = this.columns.filter(columnConfig => columnConfig.hideable);
    const nonResponseHeaders = columnConfigs.filter(columnConfig => !columnConfig.isResponseHeader);

    const hideableGroups = new Map<string, Descriptor[]>();
    const nonResponseHeadersWithoutGroup: Descriptor[] = [];

    // Sort columns into their groups
    for (const columnConfig of nonResponseHeaders) {
      if (!columnConfig.hideableGroup) {
        nonResponseHeadersWithoutGroup.push(columnConfig);
      } else {
        const name = columnConfig.hideableGroup;
        let hideableGroup = hideableGroups.get(name);
        if (!hideableGroup) {
          hideableGroup = [];
          hideableGroups.set(name, hideableGroup);
        }

        hideableGroup.push(columnConfig);
      }
    }

    // Add all the groups first
    for (const group of hideableGroups.values()) {
      const visibleColumns = group.filter(columnConfig => columnConfig.visible);

      for (const columnConfig of group) {
        // Make sure that at least one item in every group is enabled
        const isDisabled = visibleColumns.length === 1 && visibleColumns[0] === columnConfig;
        const title = columnConfig.title instanceof Function ? columnConfig.title() : columnConfig.title;

        contextMenu.headerSection().appendCheckboxItem(
            title, this.toggleColumnVisibility.bind(this, columnConfig), columnConfig.visible, isDisabled);
      }

      contextMenu.headerSection().appendSeparator();
    }

    // Add normal columns not belonging to any group
    for (const columnConfig of nonResponseHeadersWithoutGroup) {
      const title = columnConfig.title instanceof Function ? columnConfig.title() : columnConfig.title;
      contextMenu.headerSection().appendCheckboxItem(
          title, this.toggleColumnVisibility.bind(this, columnConfig), columnConfig.visible);
    }

    const responseSubMenu = contextMenu.footerSection().appendSubMenuItem(i18nString(UIStrings.responseHeaders));
    const responseHeaders = columnConfigs.filter(columnConfig => columnConfig.isResponseHeader);
    for (const columnConfig of responseHeaders) {
      const title = columnConfig.title instanceof Function ? columnConfig.title() : columnConfig.title;
      responseSubMenu.defaultSection().appendCheckboxItem(
          title, this.toggleColumnVisibility.bind(this, columnConfig), columnConfig.visible);
    }

    responseSubMenu.footerSection().appendItem(
        i18nString(UIStrings.manageHeaderColumns), this.manageCustomHeaderDialog.bind(this));

    const waterfallSortIds = WaterfallSortIds;
    const waterfallSubMenu = contextMenu.footerSection().appendSubMenuItem(i18nString(UIStrings.waterfall));
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        i18nString(UIStrings.startTime), setWaterfallMode.bind(this, waterfallSortIds.StartTime),
        this.activeWaterfallSortId === waterfallSortIds.StartTime);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        i18nString(UIStrings.responseTime), setWaterfallMode.bind(this, waterfallSortIds.ResponseTime),
        this.activeWaterfallSortId === waterfallSortIds.ResponseTime);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        i18nString(UIStrings.endTime), setWaterfallMode.bind(this, waterfallSortIds.EndTime),
        this.activeWaterfallSortId === waterfallSortIds.EndTime);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        i18nString(UIStrings.totalDuration), setWaterfallMode.bind(this, waterfallSortIds.Duration),
        this.activeWaterfallSortId === waterfallSortIds.Duration);
    waterfallSubMenu.defaultSection().appendCheckboxItem(
        i18nString(UIStrings.latency), setWaterfallMode.bind(this, waterfallSortIds.Latency),
        this.activeWaterfallSortId === waterfallSortIds.Latency);

    function setWaterfallMode(this: NetworkLogViewColumns, sortId: WaterfallSortIds): void {
      let calculator = this.calculatorsMap.get(_calculatorTypes.Time);
      const waterfallSortIds = WaterfallSortIds;
      if (sortId === waterfallSortIds.Duration || sortId === waterfallSortIds.Latency) {
        calculator = this.calculatorsMap.get(_calculatorTypes.Duration);
      }
      this.networkLogView.setCalculator((calculator as NetworkTimeCalculator));

      this.activeWaterfallSortId = sortId;
      this.dataGridInternal.markColumnAsSortedBy('waterfall', DataGrid.DataGrid.Order.Ascending);
      this.sortHandler();
    }
  }

  private manageCustomHeaderDialog(): void {
    const customHeaders = [];
    for (const columnConfig of this.columns) {
      const title = columnConfig.title instanceof Function ? columnConfig.title() : columnConfig.title;
      if (columnConfig.isResponseHeader) {
        customHeaders.push({title, editable: columnConfig.isCustomHeader});
      }
    }
    const manageCustomHeaders = new NetworkManageCustomHeadersView(
        customHeaders, headerTitle => Boolean(this.addCustomHeader(headerTitle)), this.changeCustomHeader.bind(this),
        this.removeCustomHeader.bind(this));
    const dialog = new UI.Dialog.Dialog();
    manageCustomHeaders.show(dialog.contentElement);
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    // @ts-ignore
    // TypeScript somehow tries to appy the `WidgetElement` class to the
    // `Document` type of the (Document|Element) union. WidgetElement inherits
    // from HTMLElement so its valid to be passed here.
    dialog.show(this.networkLogView.element);
  }

  private removeCustomHeader(headerId: string): boolean {
    headerId = headerId.toLowerCase();
    const index = this.columns.findIndex(columnConfig => columnConfig.id === headerId);
    if (index === -1) {
      return false;
    }
    this.columns.splice(index, 1);
    this.dataGridInternal.removeColumn(headerId);
    this.saveColumnsSettings();
    this.updateColumns();
    return true;
  }

  private addCustomHeader(headerTitle: string, headerId?: string, index?: number): Descriptor|null {
    if (!headerId) {
      headerId = headerTitle.toLowerCase();
    }
    if (index === undefined) {
      index = this.columns.length - 1;
    }

    const currentColumnConfig = this.columns.find(columnConfig => columnConfig.id === headerId);
    if (currentColumnConfig) {
      return null;
    }

    const columnConfigBase = Object.assign({}, _defaultColumnConfig, {
      id: headerId,
      title: headerTitle,
      isResponseHeader: true,
      isCustomHeader: true,
      visible: true,
      sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, headerId),
    });

    // Split out the column config from the typed version, as doing it in a single assignment causes
    // issues with Closure compiler.
    const columnConfig = (columnConfigBase as Descriptor);

    this.columns.splice(index, 0, columnConfig);
    if (this.dataGridInternal) {
      this.dataGridInternal.addColumn(NetworkLogViewColumns.convertToDataGridDescriptor(columnConfig), index);
    }
    this.saveColumnsSettings();
    this.updateColumns();
    return columnConfig;
  }

  private changeCustomHeader(oldHeaderId: string, newHeaderTitle: string, newHeaderId?: string): boolean {
    if (!newHeaderId) {
      newHeaderId = newHeaderTitle.toLowerCase();
    }
    oldHeaderId = oldHeaderId.toLowerCase();

    const oldIndex = this.columns.findIndex(columnConfig => columnConfig.id === oldHeaderId);
    const oldColumnConfig = this.columns[oldIndex];
    const currentColumnConfig = this.columns.find(columnConfig => columnConfig.id === newHeaderId);
    if (!oldColumnConfig || (currentColumnConfig && oldHeaderId !== newHeaderId)) {
      return false;
    }

    this.removeCustomHeader(oldHeaderId);
    this.addCustomHeader(newHeaderTitle, newHeaderId, oldIndex);
    return true;
  }

  private getPopoverRequest(event: Event): UI.PopoverHelper.PopoverRequest|null {
    if (!this.gridMode) {
      return null;
    }
    const hoveredNode = this.networkLogView.hoveredNode();
    if (!hoveredNode || !event.target) {
      return null;
    }

    const anchor = (event.target as HTMLElement).enclosingNodeOrSelfWithClass('network-script-initiated');
    if (!anchor) {
      return null;
    }
    const request = hoveredNode.request();
    if (!request) {
      return null;
    }
    return {
      box: anchor.boxInWindow(),
      show: async(popover: UI.GlassPane.GlassPane): Promise<boolean> => {
        this.popupLinkifier.addEventListener(Components.Linkifier.Events.LiveLocationUpdated, () => {
          popover.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
        });
        const content = RequestInitiatorView.createStackTracePreview(
            (request as SDK.NetworkRequest.NetworkRequest), this.popupLinkifier, false);
        if (!content) {
          return false;
        }
        popover.contentElement.appendChild(content.element);
        return true;
      },
      hide: this.popupLinkifier.reset.bind(this.popupLinkifier),
    };
  }

  addEventDividers(times: number[], className: string): void {
    // TODO(allada) Remove this and pass in the color.
    let color = 'transparent';
    switch (className) {
      case 'network-dcl-divider':
        color = '#0867CB';
        break;
      case 'network-load-divider':
        color = '#B31412';
        break;
      default:
        return;
    }
    const currentTimes = this.eventDividers.get(color) || [];
    this.eventDividers.set(color, currentTimes.concat(times));
    this.networkLogView.scheduleRefresh();
  }

  hideEventDividers(): void {
    this.eventDividersShown = true;
    this.redrawWaterfallColumn();
  }

  showEventDividers(): void {
    this.eventDividersShown = false;
    this.redrawWaterfallColumn();
  }

  selectFilmStripFrame(time: number): void {
    this.eventDividers.set(_filmStripDividerColor, [time]);
    this.redrawWaterfallColumn();
  }

  clearFilmStripFrame(): void {
    this.eventDividers.delete(_filmStripDividerColor);
    this.redrawWaterfallColumn();
  }
}

// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention
export const _initialSortColumn = 'waterfall';

// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum, @typescript-eslint/naming-convention
export enum _calculatorTypes {
  Duration = 'Duration',
  Time = 'Time',
}

// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention
export const _defaultColumnConfig: Object = {
  subtitle: null,
  visible: false,
  weight: 6,
  sortable: true,
  hideable: true,
  hideableGroup: null,
  nonSelectable: false,
  isResponseHeader: false,
  isCustomHeader: false,
  allowInSortByEvenWhenHidden: false,
};

// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention
const _temporaryDefaultColumns = [
  {
    id: 'name',
    title: i18nLazyString(UIStrings.name),
    subtitle: i18nLazyString(UIStrings.path),
    visible: true,
    weight: 20,
    hideable: true,
    hideableGroup: 'path',
    sortingFunction: NetworkRequestNode.NameComparator,
  },
  {
    id: 'path',
    title: i18nLazyString(UIStrings.path),
    hideable: true,
    hideableGroup: 'path',
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'pathname'),
  },
  {
    id: 'url',
    title: i18nLazyString(UIStrings.url),
    hideable: true,
    hideableGroup: 'path',
    sortingFunction: NetworkRequestNode.RequestURLComparator,
  },
  {
    id: 'method',
    title: i18nLazyString(UIStrings.method),
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'requestMethod'),
  },
  {
    id: 'status',
    title: i18nLazyString(UIStrings.status),
    visible: true,
    subtitle: i18nLazyString(UIStrings.text),
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'statusCode'),
  },
  {
    id: 'protocol',
    title: i18nLazyString(UIStrings.protocol),
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'protocol'),
  },
  {
    id: 'scheme',
    title: i18nLazyString(UIStrings.scheme),
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'scheme'),
  },
  {
    id: 'domain',
    title: i18nLazyString(UIStrings.domain),
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'domain'),
  },
  {
    id: 'remoteaddress',
    title: i18nLazyString(UIStrings.remoteAddress),
    weight: 10,
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: NetworkRequestNode.RemoteAddressComparator,
  },
  {
    id: 'remoteaddress-space',
    title: i18nLazyString(UIStrings.remoteAddressSpace),
    visible: false,
    weight: 10,
    sortingFunction: NetworkRequestNode.RemoteAddressSpaceComparator,
  },
  {
    id: 'type',
    title: i18nLazyString(UIStrings.type),
    visible: true,
    sortingFunction: NetworkRequestNode.TypeComparator,
  },
  {
    id: 'initiator',
    title: i18nLazyString(UIStrings.initiator),
    visible: true,
    weight: 10,
    sortingFunction: NetworkRequestNode.InitiatorComparator,
  },
  {
    id: 'initiator-address-space',
    title: i18nLazyString(UIStrings.initiatorAddressSpace),
    visible: false,
    weight: 10,
    sortingFunction: NetworkRequestNode.InitiatorAddressSpaceComparator,
  },
  {
    id: 'cookies',
    title: i18nLazyString(UIStrings.cookies),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: NetworkRequestNode.RequestCookiesCountComparator,
  },
  {
    id: 'setcookies',
    title: i18nLazyString(UIStrings.setCookies),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: NetworkRequestNode.ResponseCookiesCountComparator,
  },
  {
    id: 'size',
    title: i18nLazyString(UIStrings.size),
    visible: true,
    subtitle: i18nLazyString(UIStrings.content),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: NetworkRequestNode.SizeComparator,
  },
  {
    id: 'time',
    title: i18nLazyString(UIStrings.time),
    visible: true,
    subtitle: i18nLazyString(UIStrings.latency),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'duration'),
  },
  {id: 'priority', title: i18nLazyString(UIStrings.priority), sortingFunction: NetworkRequestNode.PriorityComparator},
  {
    id: 'connectionid',
    title: i18nLazyString(UIStrings.connectionId),
    sortingFunction: NetworkRequestNode.RequestPropertyComparator.bind(null, 'connectionId'),
  },
  {
    id: 'cache-control',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Cache-Control'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'cache-control'),
  },
  {
    id: 'connection',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Connection'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'connection'),
  },
  {
    id: 'content-encoding',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Content-Encoding'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'content-encoding'),
  },
  {
    id: 'content-length',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Content-Length'),
    align: DataGrid.DataGrid.Align.Right,
    sortingFunction: NetworkRequestNode.ResponseHeaderNumberComparator.bind(null, 'content-length'),
  },
  {
    id: 'etag',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('ETag'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'etag'),
  },
  {
    id: 'has-overrides',
    title: i18nLazyString(UIStrings.hasOverrides),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'has-overrides'),
  },
  {
    id: 'keep-alive',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Keep-Alive'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'keep-alive'),
  },
  {
    id: 'last-modified',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Last-Modified'),
    sortingFunction: NetworkRequestNode.ResponseHeaderDateComparator.bind(null, 'last-modified'),
  },
  {
    id: 'server',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Server'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'server'),
  },
  {
    id: 'vary',
    isResponseHeader: true,
    title: i18n.i18n.lockedLazyString('Vary'),
    sortingFunction: NetworkRequestNode.ResponseHeaderStringComparator.bind(null, 'vary'),
  },
  // This header is a placeholder to let datagrid know that it can be sorted by this column, but never shown.
  {
    id: 'waterfall',
    title: i18nLazyString(UIStrings.waterfall),
    visible: false,
    hideable: false,
    allowInSortByEvenWhenHidden: true,
  },
];

// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-explicit-any
const _defaultColumns = (_temporaryDefaultColumns as any);

// TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
// eslint-disable-next-line @typescript-eslint/naming-convention
export const _filmStripDividerColor = '#fccc49';

// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export enum WaterfallSortIds {
  StartTime = 'startTime',
  ResponseTime = 'responseReceivedTime',
  EndTime = 'endTime',
  Duration = 'duration',
  Latency = 'latency',
}
export interface Descriptor {
  id: string;
  title: string|(() => string);
  titleDOMFragment?: DocumentFragment;
  subtitle: string|(() => string)|null;
  visible: boolean;
  weight: number;
  hideable: boolean;
  hideableGroup: string|null;
  nonSelectable: boolean;
  sortable: boolean;
  align?: string|null;
  isResponseHeader: boolean;
  sortingFunction: (arg0: NetworkNode, arg1: NetworkNode) => number | undefined;
  isCustomHeader: boolean;
  allowInSortByEvenWhenHidden: boolean;
}
