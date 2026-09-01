import React from 'react';
import { Animated } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import {
  getMapTopControlPosition,
  MapControls,
  MapLegendControl,
} from './MapControls';

describe('MapControls', () => {
  it('keeps the native compass aligned as the shared header moves', () => {
    expect(getMapTopControlPosition(24, 54, 1)).toBe(136);
    expect(getMapTopControlPosition(24, 54, 0.5)).toBe(109);
    expect(getMapTopControlPosition(24, 54, 0)).toBe(82);
  });

  it('routes map style and terrain interactions to the controller', async () => {
    const setExpanded = jest.fn();
    const setMapMode = jest.fn();
    const setThreeDEnabled = jest.fn();
    const view = await render(
      <MapControls
        colors={{ border: '#cbd5e1', surface: '#ffffff', text: '#0f172a', textMuted: '#64748b' }}
        expanded
        mapMode="street"
        progress={new Animated.Value(1)}
        setExpanded={setExpanded}
        setMapMode={setMapMode}
        setThreeDEnabled={setThreeDEnabled}
        threeDEnabled={false}
      />,
    );

    await fireEvent.press(view.getByLabelText('Use satellite map'));
    await fireEvent.press(view.getByLabelText('Enable terrain view'));

    expect(setMapMode).toHaveBeenCalledWith('satellite');
    expect(setThreeDEnabled).toHaveBeenCalledWith(expect.any(Function));
  });

  it('keeps legend interactions in a separate stacked control', async () => {
    const setLegendExpanded = jest.fn();
    const colors = { border: '#cbd5e1', surface: '#ffffff', text: '#0f172a', textMuted: '#64748b' };
    const view = await render(
      <MapLegendControl
        colors={colors}
        expanded={false}
        setExpanded={setLegendExpanded}
      />,
    );

    await fireEvent.press(view.getByLabelText('Show map legend'));
    expect(setLegendExpanded).toHaveBeenCalledWith(expect.any(Function));

    await view.rerender(
      <MapLegendControl
        colors={colors}
        expanded
        setExpanded={setLegendExpanded}
      />,
    );
    expect(view.getByText('Map legend')).toBeTruthy();
    expect(view.getByText('Backup request')).toBeTruthy();

    await fireEvent.press(view.getAllByLabelText('Hide map legend')[0]);
    expect(setLegendExpanded).toHaveBeenCalledWith(false);
  });
});
