
import React, { useCallback } from 'react';
import { ScenarioFile } from '../types';
import { TRANSLATIONS, LanguageKey } from '../utils/translations';

interface Props {
  onUpload: (files: ScenarioFile[]) => void;
  language: LanguageKey;
}

export const MarkdownUploader: React.FC<Props> = ({ onUpload, language }) => {
  const t = TRANSLATIONS[language];
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const loadedFiles: ScenarioFile[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.md')) {
        const promise = file.text().then((content) => {
          loadedFiles.push({ name: file.name, content });
        });
        promises.push(promise);
      }
    }

    await Promise.all(promises);
    onUpload(loadedFiles);
  }, [onUpload]);

  return (
    <div className="w-full border-2 border-dashed border-amber-900 p-8 hover:border-amber-500 transition-colors group cursor-pointer relative">
        <div className="absolute top-0 left-0 bg-black px-2 -mt-3 text-amber-900 group-hover:text-amber-500">{t.upload_title}</div>
      
        <pre className="text-amber-500 text-xs leading-3 mb-6 opacity-50 select-none">
{`
 +-----------------------+
 |  [LOAD .MD FILES]     |
 |  ${t.upload_detect.padEnd(19)}  |
 +-----------------------+
`}
        </pre>

      <p className="text-amber-500 mb-6 uppercase">
        {t.upload_desc}<br/>
        <span className="text-xs opacity-50">{t.upload_fmt}</span>
      </p>
      
      <label className="bg-amber-900 hover:bg-amber-500 text-black px-6 py-2 font-bold cursor-pointer uppercase inline-block">
        <span>{t.upload_btn}</span>
        <input type="file" multiple accept=".md" className="hidden" onChange={handleFileChange} />
      </label>
    </div>
  );
};
