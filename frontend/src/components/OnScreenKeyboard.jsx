import React from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import './OnScreenKeyboard.css';

// Розкладка клавіатури для англомовного нікнейму.
// 10 цифр + 26 літер + 3 спеціальні клавіші (backspace, space, enter) = 39 клавіш.
const LAYOUT = {
  default: [
    '1 2 3 4 5 6 7 8 9 0',
    'q w e r t y u i o p',
    'a s d f g h j k l',
    'z x c v b n m {bksp}',
    '{space} {enter}'
  ]
};

// Що показувати на спеціальних клавішах.
const DISPLAY = {
  '{bksp}': '⌫',
  '{enter}': '✓ Приєднатись',
  '{space}': '␣'
};

// Максимальна довжина нікнейму — синхронізована з maxLength=20 на нативному <input>.
const MAX_LEN = 20;

export default function OnScreenKeyboard({ value, onChange, onEnter }) {
  const handleKeyPress = (button) => {
    if (button === '{bksp}') {
      onChange(value.slice(0, -1));
      return;
    }
    if (button === '{space}') {
      onChange((value + ' ').slice(0, MAX_LEN));
      return;
    }
    if (button === '{enter}') {
      onEnter();
      return;
    }
    // Регулярна літера/цифра — додаємо з обрізанням до MAX_LEN.
    onChange((value + button).slice(0, MAX_LEN));
  };

  return (
    <div className="osk-container">
      <Keyboard
        layout={LAYOUT}
        display={DISPLAY}
        onKeyPress={handleKeyPress}
        theme="hg-theme-default kiosk-keyboard"
        physicalKeyboardHighlight={false}
        useButtonTag={false}
      />
    </div>
  );
}
