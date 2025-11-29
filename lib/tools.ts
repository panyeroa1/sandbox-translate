/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { FunctionResponseScheduling } from '@google/genai';
import { FunctionCall } from './state';

export const zoomTools: FunctionCall[] = [
  {
    name: 'join_meeting',
    description: 'Joins a Zoom meeting using the provided meeting ID and passcode.',
    parameters: {
      type: 'OBJECT',
      properties: {
        meetingId: {
          type: 'STRING',
          description: 'The Zoom Meeting ID (numbers only).',
        },
        passcode: {
          type: 'STRING',
          description: 'The passcode for the meeting.',
        },
        userName: {
          type: 'STRING',
          description: 'The display name to use when joining.',
        },
      },
      required: ['meetingId'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
];