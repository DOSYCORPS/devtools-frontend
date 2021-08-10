// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as SDK from '../../core/sdk/sdk.js';
import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';

export interface PlayerEvent extends Protocol.Media.PlayerEvent {
  value: string;
  displayTimestamp: string;
  event: string;
}

export const enum ProtocolTriggers {
  PlayerPropertiesChanged = 'PlayerPropertiesChanged',
  PlayerEventsAdded = 'PlayerEventsAdded',
  PlayerMessagesLogged = 'PlayerMessagesLogged',
  PlayerErrorsRaised = 'PlayerErrorsRaised',
  PlayersCreated = 'PlayersCreated',
}

export class MediaModel extends SDK.SDKModel.SDKModel implements ProtocolProxyApi.MediaDispatcher {
  private enabled: boolean;
  private readonly agent: ProtocolProxyApi.MediaApi;

  constructor(target: SDK.Target.Target) {
    super(target);

    this.enabled = false;
    this.agent = target.mediaAgent();

    target.registerMediaDispatcher(this);
  }

  async resumeModel(): Promise<void> {
    if (!this.enabled) {
      return Promise.resolve();
    }
    await this.agent.invoke_enable();
  }

  ensureEnabled(): void {
    this.agent.invoke_enable();
    this.enabled = true;
  }

  playerPropertiesChanged(event: Protocol.Media.PlayerPropertiesChangedEvent): void {
    this.dispatchEventToListeners(ProtocolTriggers.PlayerPropertiesChanged, event);
  }

  playerEventsAdded(event: Protocol.Media.PlayerEventsAddedEvent): void {
    this.dispatchEventToListeners(ProtocolTriggers.PlayerEventsAdded, event);
  }

  playerMessagesLogged(event: Protocol.Media.PlayerMessagesLoggedEvent): void {
    this.dispatchEventToListeners(ProtocolTriggers.PlayerMessagesLogged, event);
  }

  playerErrorsRaised(event: Protocol.Media.PlayerErrorsRaisedEvent): void {
    this.dispatchEventToListeners(ProtocolTriggers.PlayerErrorsRaised, event);
  }

  playersCreated({players}: Protocol.Media.PlayersCreatedEvent): void {
    this.dispatchEventToListeners(ProtocolTriggers.PlayersCreated, players);
  }
}
SDK.SDKModel.SDKModel.register(MediaModel, {capabilities: SDK.Target.Capability.Media, autostart: false});
