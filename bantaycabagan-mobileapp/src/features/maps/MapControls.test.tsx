import React from 'react';
import { Animated } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { MapControls } from './MapControls';

describe('MapControls', () => {
  it('routes map style, terrain, and legend interactions to the controller', async () => {
    const setExpanded = jest.fn();
    const setLegendExpanded = jest.fn();
    const setMapMode = jest.fn();
    const setThreeDEnabled = jest.fn();
    const view = await render(
      <MapControls
        colors={{ border: '#cbd5e1', surface: '#ffffff', text: '#0f172a', textMuted: '#64748b' }}
        expanded
        legendExpanded={false}
        mapMode="street"
        progress={new Animated.Value(1)}
        setExpanded={setExpanded}
        setLegendExpanded={setLegendExpanded}
        setMapMode={setMapMode}
        setThreeDEnabled={setThreeDEnabled}
        threeDEnabled={false}
      />,
    );

    await fireEvent.press(view.getByLabelText('Use satellite map'));
    await fireEvent.press(view.getByLabelText('Enable terrain view'));
    await fireEvent.press(view.getByLabelText('Show map legend'));

    expect(setMapMode).toHaveBeenCalledWith('satellite');
    expect(setThreeDEnabled).toHaveBeenCalledWith(expect.any(Function));
    expect(setLegendExpanded).toHaveBeenCalledWith(expect.any(Function));
  });
});
