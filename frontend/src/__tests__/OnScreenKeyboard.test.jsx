import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import OnScreenKeyboard from '../components/OnScreenKeyboard';

describe('OnScreenKeyboard', () => {
  // react-simple-keyboard binds onpointerdown (not onmousedown) when window.PointerEvent
  // is available, which jsdom does provide. Tests use fireEvent.pointerDown for that reason.

  const renderKb = (props = {}) => {
    const onChange = vi.fn();
    const onEnter = vi.fn();
    const result = render(
      <OnScreenKeyboard value="" onChange={onChange} onEnter={onEnter} {...props} />
    );
    return { ...result, onChange, onEnter };
  };

  test('renders 39 keys (10 digits + 26 letters + 3 specials)', () => {
    const { container } = renderKb();
    const keys = container.querySelectorAll('.hg-button');
    expect(keys.length).toBe(39);
  });

  test('tapping a letter appends to value via onChange', () => {
    const { container, onChange } = renderKb({ value: 'hello' });
    const aKey = container.querySelector('[data-skbtn="a"]');
    expect(aKey).toBeTruthy();
    fireEvent.pointerDown(aKey);
    expect(onChange).toHaveBeenCalledWith('helloa');
  });

  test('tapping {bksp} removes the last character', () => {
    const { container, onChange } = renderKb({ value: 'hello' });
    const bksp = container.querySelector('[data-skbtn="{bksp}"]');
    expect(bksp).toBeTruthy();
    fireEvent.pointerDown(bksp);
    expect(onChange).toHaveBeenCalledWith('hell');
  });

  test('tapping {enter} calls onEnter exactly once', () => {
    const { container, onEnter } = renderKb({ value: 'bob' });
    const enter = container.querySelector('[data-skbtn="{enter}"]');
    expect(enter).toBeTruthy();
    fireEvent.pointerDown(enter);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  test('respects 20-char length cap on letter taps', () => {
    const { container, onChange } = renderKb({ value: 'a'.repeat(20) });
    const bKey = container.querySelector('[data-skbtn="b"]');
    fireEvent.pointerDown(bKey);
    expect(onChange).toHaveBeenCalledWith('a'.repeat(20));
  });
});
