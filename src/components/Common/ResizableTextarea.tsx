import { useRef, forwardRef, useImperativeHandle } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { useResizePersistence } from '../../useResizePersistence';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref'> & {
  taskId: string;
  fieldKey: string;
};

// A <textarea> that remembers its resized height per (taskId, fieldKey).
export const ResizableTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function ResizableTextarea({ taskId, fieldKey, style, ...rest }, forwardedRef) {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current!, []);
    useResizePersistence(innerRef, taskId, fieldKey);
    return <textarea ref={innerRef} style={style} {...rest} />;
  }
);
