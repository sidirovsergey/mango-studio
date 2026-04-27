import type { ReactNode } from 'react';

interface StageHeadProps {
  num: string;
  title: string;
  children?: ReactNode;
}

export function StageHead({ num, title, children }: StageHeadProps) {
  return (
    <div className="stage-head">
      <span className="stage-num">{num}</span>
      <div className="stage-title">{title}</div>
      {children}
    </div>
  );
}
