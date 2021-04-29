// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const {assert} = chai;

import {describeWithEnvironment} from '../../helpers/EnvironmentHelpers.js';
import * as Common from '../../../../../front_end/core/common/common.js';
import * as SDK from '../../../../../front_end/core/sdk/sdk.js';
import * as UI from '../../../../../front_end/ui/legacy/legacy.js';
import * as HAR from '../../../../../front_end/models/har/har.js';

const simulateRequestWithStartTime = (startTime: number): SDK.NetworkRequest.NetworkRequest => {
  const request = new SDK.NetworkRequest.NetworkRequest('r0', 'p0.com', '', '', '', null);
  request.setIssueTime(startTime, startTime);
  request.setContentDataProvider(() => Promise.resolve({error: null, content: '', encoded: false}));
  return request;
};

describeWithEnvironment('HARWriter', () => {
  it('can correctly sort exported requests logs', async () => {
    const req1Time = new Date(2020, 0, 3);
    const req2Time = new Date(2020, 1, 3);
    const req3Time = new Date(2020, 2, 3);
    const req1 = simulateRequestWithStartTime(req1Time.getTime() / 1000);
    const req2 = simulateRequestWithStartTime(req2Time.getTime() / 1000);
    const req3 = simulateRequestWithStartTime(req3Time.getTime() / 1000);

    const progressIndicator = new UI.ProgressIndicator.ProgressIndicator();
    const compositeProgress = new Common.Progress.CompositeProgress(progressIndicator);
    const result = await HAR.Writer.Writer._harStringForRequests(
        [
          req3,
          req2,
          req1,
        ],
        compositeProgress);
    const resultEntries = JSON.parse(result).log.entries;
    assert.strictEqual(resultEntries[0].startedDateTime, req1Time.toJSON(), 'earlier request should come first');
    assert.strictEqual(resultEntries[1].startedDateTime, req2Time.toJSON(), 'earlier request should come first');
    assert.strictEqual(resultEntries[2].startedDateTime, req3Time.toJSON(), 'earlier request should come first');
  });
});
