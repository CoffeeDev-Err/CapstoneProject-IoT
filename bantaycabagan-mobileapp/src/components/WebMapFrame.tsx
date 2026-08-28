import React, { forwardRef } from 'react';

export const WebMapFrame = forwardRef<any, { html: string; onLoad: () => void }>(
  ({ html, onLoad }, ref) => React.createElement('iframe' as any, {
    ref,
    srcDoc: html,
    title: 'Live personnel map',
    onLoad,
    sandbox: 'allow-scripts',
    referrerPolicy: 'no-referrer',
    style: {
      width: '100%',
      height: '100%',
      border: 'none',
      backgroundColor: '#e5e4df',
    },
  }),
);

WebMapFrame.displayName = 'WebMapFrame';
