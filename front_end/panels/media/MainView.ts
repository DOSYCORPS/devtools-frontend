// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';

import type {PlayerEvent} from './MediaModel.js';
import {MediaModel, ProtocolTriggers} from './MediaModel.js';
import {PlayerDetailView} from './PlayerDetailView.js';
import {PlayerListView} from './PlayerListView.js';

export interface TriggerHandler {
  onProperty(property: Protocol.Media.PlayerProperty): void;
  onError(error: Protocol.Media.PlayerError): void;
  onMessage(message: Protocol.Media.PlayerMessage): void;
  onEvent(event: PlayerEvent): void;
}

export interface TriggerDispatcher {
  onProperty(playerID: string, property: Protocol.Media.PlayerProperty): void;
  onError(playerID: string, error: Protocol.Media.PlayerError): void;
  onMessage(playerID: string, message: Protocol.Media.PlayerMessage): void;
  onEvent(playerID: string, event: PlayerEvent): void;
}

class PlayerDataCollection implements TriggerHandler {
  private readonly properties: Map<string, string>;
  private readonly messages: Protocol.Media.PlayerMessage[];
  private readonly events: PlayerEvent[];
  private readonly errors: Protocol.Media.PlayerError[];

  constructor() {
    this.properties = new Map();
    this.messages = [];
    this.events = [];
    this.errors = [];
  }

  onProperty(property: Protocol.Media.PlayerProperty): void {
    this.properties.set(property.name, property.value);
  }

  onError(error: Protocol.Media.PlayerError): void {
    this.errors.push(error);
  }

  onMessage(message: Protocol.Media.PlayerMessage): void {
    this.messages.push(message);
  }

  onEvent(event: PlayerEvent): void {
    this.events.push(event);
  }

  export(): {
    properties: Map<string, string>,
    messages: Protocol.Media.PlayerMessage[],
    events: PlayerEvent[],
    errors: Protocol.Media.PlayerError[],
  } {
    return {'properties': this.properties, 'messages': this.messages, 'events': this.events, 'errors': this.errors};
  }
}

class PlayerDataDownloadManager implements TriggerDispatcher {
  private readonly playerDataCollection: Map<string, PlayerDataCollection>;
  constructor() {
    this.playerDataCollection = new Map();
  }

  addPlayer(playerID: string): void {
    this.playerDataCollection.set(playerID, new PlayerDataCollection());
  }

  onProperty(playerID: string, property: Protocol.Media.PlayerProperty): void {
    const playerProperty = this.playerDataCollection.get(playerID);
    if (!playerProperty) {
      return;
    }

    playerProperty.onProperty(property);
  }

  onError(playerID: string, error: Protocol.Media.PlayerError): void {
    const playerProperty = this.playerDataCollection.get(playerID);
    if (!playerProperty) {
      return;
    }

    playerProperty.onError(error);
  }

  onMessage(playerID: string, message: Protocol.Media.PlayerMessage): void {
    const playerProperty = this.playerDataCollection.get(playerID);
    if (!playerProperty) {
      return;
    }

    playerProperty.onMessage(message);
  }

  onEvent(playerID: string, event: PlayerEvent): void {
    const playerProperty = this.playerDataCollection.get(playerID);
    if (!playerProperty) {
      return;
    }

    playerProperty.onEvent(event);
  }

  exportPlayerData(playerID: string): {
    properties: Map<string, string>,
    messages: Protocol.Media.PlayerMessage[],
    events: PlayerEvent[],
    errors: Protocol.Media.PlayerError[],
  } {
    const playerProperty = this.playerDataCollection.get(playerID);
    if (!playerProperty) {
      throw new Error('Unable to find player');
    }

    return playerProperty.export();
  }

  deletePlayer(playerID: string): void {
    this.playerDataCollection.delete(playerID);
  }
}

let mainViewInstance: MainView;
export class MainView extends UI.Panel.PanelWithSidebar implements SDK.TargetManager.SDKModelObserver<MediaModel> {
  private detailPanels: Map<string, PlayerDetailView>;
  private deletedPlayers: Set<string>;
  private readonly downloadStore: PlayerDataDownloadManager;
  private readonly sidebar: PlayerListView;

  constructor() {
    super('Media');
    this.detailPanels = new Map();

    this.deletedPlayers = new Set();

    this.downloadStore = new PlayerDataDownloadManager();

    this.sidebar = new PlayerListView(this);
    this.sidebar.show(this.panelSidebarElement());

    SDK.TargetManager.TargetManager.instance().observeModels(MediaModel, this);
  }

  static instance(opts = {forceNew: null}): MainView {
    const {forceNew} = opts;
    if (!mainViewInstance || forceNew) {
      mainViewInstance = new MainView();
    }

    return mainViewInstance;
  }

  renderMainPanel(playerID: string): void {
    if (!this.detailPanels.has(playerID)) {
      return;
    }
    const mainWidget = this.splitWidget().mainWidget();
    if (mainWidget) {
      mainWidget.detachChildWidgets();
    }
    this.detailPanels.get(playerID)?.show(this.mainElement());
  }

  wasShown(): void {
    super.wasShown();
    for (const model of SDK.TargetManager.TargetManager.instance().models(MediaModel)) {
      this.addEventListeners(model);
    }
  }

  willHide(): void {
    for (const model of SDK.TargetManager.TargetManager.instance().models(MediaModel)) {
      this.removeEventListeners(model);
    }
  }

  modelAdded(model: MediaModel): void {
    if (this.isShowing()) {
      this.addEventListeners(model);
    }
  }

  modelRemoved(model: MediaModel): void {
    this.removeEventListeners(model);
  }

  private addEventListeners(mediaModel: MediaModel): void {
    mediaModel.ensureEnabled();
    mediaModel.addEventListener(ProtocolTriggers.PlayerPropertiesChanged, this.propertiesChanged, this);
    mediaModel.addEventListener(ProtocolTriggers.PlayerEventsAdded, this.eventsAdded, this);
    mediaModel.addEventListener(ProtocolTriggers.PlayerMessagesLogged, this.messagesLogged, this);
    mediaModel.addEventListener(ProtocolTriggers.PlayerErrorsRaised, this.errorsRaised, this);
    mediaModel.addEventListener(ProtocolTriggers.PlayersCreated, this.playersCreated, this);
  }

  private removeEventListeners(mediaModel: MediaModel): void {
    mediaModel.removeEventListener(ProtocolTriggers.PlayerPropertiesChanged, this.propertiesChanged, this);
    mediaModel.removeEventListener(ProtocolTriggers.PlayerEventsAdded, this.eventsAdded, this);
    mediaModel.removeEventListener(ProtocolTriggers.PlayerMessagesLogged, this.messagesLogged, this);
    mediaModel.removeEventListener(ProtocolTriggers.PlayerErrorsRaised, this.errorsRaised, this);
    mediaModel.removeEventListener(ProtocolTriggers.PlayersCreated, this.playersCreated, this);
  }

  private onPlayerCreated(playerID: string): void {
    this.sidebar.addMediaElementItem(playerID);
    this.detailPanels.set(playerID, new PlayerDetailView());
    this.downloadStore.addPlayer(playerID);
  }

  private propertiesChanged(event: Common.EventTarget.EventTargetEvent): void {
    for (const property of event.data.properties) {
      this.onProperty(event.data.playerId, property);
    }
  }

  private eventsAdded(event: Common.EventTarget.EventTargetEvent): void {
    for (const ev of event.data.events) {
      this.onEvent(event.data.playerId, ev);
    }
  }

  private messagesLogged(event: Common.EventTarget.EventTargetEvent): void {
    for (const message of event.data.messages) {
      this.onMessage(event.data.playerId, message);
    }
  }

  private errorsRaised(event: Common.EventTarget.EventTargetEvent): void {
    for (const error of event.data.errors) {
      this.onError(event.data.playerId, error);
    }
  }

  private shouldPropagate(playerID: string): boolean {
    return !this.deletedPlayers.has(playerID) && this.detailPanels.has(playerID);
  }

  onProperty(playerID: string, property: Protocol.Media.PlayerProperty): void {
    if (!this.shouldPropagate(playerID)) {
      return;
    }
    this.sidebar.onProperty(playerID, property);
    this.downloadStore.onProperty(playerID, property);
    this.detailPanels.get(playerID)?.onProperty(property);
  }

  onError(playerID: string, error: Protocol.Media.PlayerError): void {
    if (!this.shouldPropagate(playerID)) {
      return;
    }
    this.sidebar.onError(playerID, error);
    this.downloadStore.onError(playerID, error);
    this.detailPanels.get(playerID)?.onError(error);
  }

  onMessage(playerID: string, message: Protocol.Media.PlayerMessage): void {
    if (!this.shouldPropagate(playerID)) {
      return;
    }
    this.sidebar.onMessage(playerID, message);
    this.downloadStore.onMessage(playerID, message);
    this.detailPanels.get(playerID)?.onMessage(message);
  }

  onEvent(playerID: string, event: PlayerEvent): void {
    if (!this.shouldPropagate(playerID)) {
      return;
    }
    this.sidebar.onEvent(playerID, event);
    this.downloadStore.onEvent(playerID, event);
    this.detailPanels.get(playerID)?.onEvent(event);
  }

  private playersCreated(event: Common.EventTarget.EventTargetEvent): void {
    const playerlist = event.data as Iterable<string>;
    for (const playerID of playerlist) {
      this.onPlayerCreated(playerID);
    }
  }

  markPlayerForDeletion(playerID: string): void {
    // TODO(tmathmeyer): send this to chromium to save the storage space there too.
    this.deletedPlayers.add(playerID);
    this.detailPanels.delete(playerID);
    this.sidebar.deletePlayer(playerID);
    this.downloadStore.deletePlayer(playerID);
  }

  markOtherPlayersForDeletion(playerID: string): void {
    for (const keyID of this.detailPanels.keys()) {
      if (keyID !== playerID) {
        this.markPlayerForDeletion(keyID);
      }
    }
  }

  exportPlayerData(playerID: string): void {
    const dump = this.downloadStore.exportPlayerData(playerID);
    const uriContent = 'data:application/octet-stream,' + encodeURIComponent(JSON.stringify(dump, null, 2));
    const anchor = document.createElement('a');
    anchor.href = uriContent;
    anchor.download = playerID + '.json';
    anchor.click();
  }
}
