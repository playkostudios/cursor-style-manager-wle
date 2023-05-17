import { Component } from '@wonderlandengine/api';

export interface ICursorStyleManager extends Component {
    cursorStyleHandler(style: string): void;
    getStyle(key: unknown): string | null;
    setStyle(key: unknown, style: string): void;
    clearStyle(key: unknown): void;
}