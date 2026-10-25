import { describe, it, expect } from 'vitest';
import { fileKind, fileMime, safeExt } from '../lib/fileKinds';
import { safeColor } from '../lib/safe';

describe('fileKind: что можно загружать', () => {
  it('определяет картинки, видео и аудио по MIME', () => {
    expect(fileKind({ name: 'a.png', type: 'image/png' })).toBe('image');
    expect(fileKind({ name: 'a.mp4', type: 'video/mp4' })).toBe('video');
    expect(fileKind({ name: 'a.mp3', type: 'audio/mpeg' })).toBe('audio');
  });
  it('если браузер не знает тип — смотрит на расширение', () => {
    expect(fileKind({ name: 'song.FLAC', type: '' })).toBe('audio');
    expect(fileKind({ name: 'clip.mov', type: 'application/octet-stream' })).toBe('video');
    expect(fileMime({ name: 'song.flac', type: '' })).toBe('audio/flac');
  });
  it('SVG, HTML и исполняемые файлы не пропускает', () => {
    expect(fileKind({ name: 'a.svg', type: 'image/svg+xml' })).toBeNull();
    expect(fileKind({ name: 'a.html', type: 'text/html' })).toBeNull();
    expect(fileKind({ name: 'a.exe', type: '' })).toBeNull();
    expect(fileKind({ name: 'noext', type: '' })).toBeNull();
  });
  it('безопасное расширение для пути в хранилище', () => {
    expect(safeExt('photo.JPG')).toBe('jpg');
    expect(safeExt('weird.ph/p')).toBe('bin');
  });
});

describe('safeColor: цвет попадает в CSS', () => {
  it('пропускает только hex', () => {
    expect(safeColor('#aabbcc')).toBe('#aabbcc');
    expect(safeColor('#fff')).toBe('#fff');
  });
  it('всё остальное заменяет запасным', () => {
    expect(safeColor('red; background:url(http://evil)')).toBe('#7c6ff7');
    expect(safeColor('url(x)')).toBe('#7c6ff7');
    expect(safeColor(undefined, '#000000')).toBe('#000000');
  });
});
