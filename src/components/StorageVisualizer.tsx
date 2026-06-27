import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface StorageVisualizerProps {
  limit: number;
  usage: number;
  free: number;
  totalFiles: string;
}

export default function StorageVisualizer({ limit, usage, free, totalFiles }: StorageVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 280, height: 280 });

  useEffect(() => {
    const observeTarget = containerRef.current;
    if (!observeTarget) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          // Keep it square based on width
          setDimensions({ width, height: width });
        }
      }
    });

    resizeObserver.observe(observeTarget);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || dimensions.width <= 0) return;

    // Clear previous SVG
    d3.select(containerRef.current).selectAll('svg').remove();

    const { width, height } = dimensions;
    const margin = 10;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('id', 'd3-storage-visualizer-svg')
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const percentage = Math.max(0.01, Math.min(1, usage / (limit || 1)));

    // Create glowing glow-filter
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', 'neon-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'blur');
    filter.append('feMerge')
      .selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic'])
      .enter()
      .append('feMergeNode')
      .attr('in', d => d);

    // Inner scanning core pattern
    const radialArc = d3.arc<any, any>()
      .innerRadius(radius - (radius * 0.15))
      .outerRadius(radius - (radius * 0.05))
      .startAngle(0)
      .endAngle(2 * Math.PI);

    // Background track (Uses currentColor class for theme support)
    svg.append('path')
      .attr('d', radialArc as any)
      .attr('class', 'fill-emerald-950/40 stroke-emerald-800')
      .attr('stroke-width', 1);

    // Dynamic Used Arc
    const usedArc = d3.arc<any, any>()
      .innerRadius(radius - (radius * 0.15))
      .outerRadius(radius - (radius * 0.05))
      .startAngle(0)
      .endAngle(2 * Math.PI * percentage);

    svg.append('path')
      .attr('d', usedArc as any)
      .attr('class', 'fill-emerald-500')
      .attr('filter', 'url(#neon-glow)')
      .attr('opacity', 0.85);

    // Ticks & Grid markers
    const ticksCount = 40;
    for (let i = 0; i < ticksCount; i++) {
      const angle = (i / ticksCount) * 2 * Math.PI;
      const isUsed = (i / ticksCount) <= percentage;
      const r1 = radius - (radius * 0.03);
      const r2 = radius - (radius * 0.01);
      const x1 = Math.sin(angle) * r1;
      const y1 = -Math.cos(angle) * r1;
      const x2 = Math.sin(angle) * r2;
      const y2 = -Math.cos(angle) * r2;

      svg.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('class', isUsed ? 'stroke-emerald-400' : 'stroke-emerald-900')
        .attr('stroke-width', isUsed ? 1.5 : 1)
        .attr('opacity', isUsed ? 0.9 : 0.4);
    }

    // Interactive Core (pulsing hover center)
    const centerGroup = svg.append('g')
      .style('cursor', 'pointer');

    const coreCircle = centerGroup.append('circle')
      .attr('r', radius - (radius * 0.2))
      .attr('class', 'fill-emerald-950/20 stroke-emerald-500')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4, 4');

    // Pulse animation
    function pulse() {
      coreCircle.transition()
        .duration(1500)
        .attr('r', radius - (radius * 0.17))
        .style('opacity', 0.4)
        .transition()
        .duration(1500)
        .attr('r', radius - (radius * 0.2))
        .style('opacity', 0.2)
        .on('end', pulse);
    }
    pulse();

    // Text details inside core
    const textScale = Math.max(0.5, radius / 130);
    
    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', `${-20 * textScale}px`)
      .attr('class', 'fill-emerald-400 font-mono')
      .attr('font-size', `${10 * textScale}px`)
      .attr('letter-spacing', '2px')
      .text('USAGE MATRIX');

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', `${5 * textScale}px`)
      .attr('class', 'fill-emerald-100 font-bold font-mono')
      .attr('font-size', `${24 * textScale}px`)
      .attr('filter', 'url(#neon-glow)')
      .text(`${Math.round(percentage * 100)}%`);

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', `${24 * textScale}px`)
      .attr('class', 'fill-emerald-600 font-mono')
      .attr('font-size', `${9 * textScale}px`)
      .text(`${totalFiles} MAPPED`);

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', `${40 * textScale}px`)
      .attr('class', 'fill-emerald-500 font-mono')
      .attr('font-size', `${8 * textScale}px`)
      .attr('letter-spacing', '1px')
      .text('SECURE CLOUD');

  }, [limit, usage, free, totalFiles, dimensions]);

  return (
    <div className="flex flex-col items-center justify-center w-full relative p-2 select-none h-full max-h-[300px]">
      <div ref={containerRef} className="w-full h-full min-h-[150px] max-w-[280px]" id="d3-visualizer-container" />
      <div className="absolute inset-0 border border-emerald-500/5 pointer-events-none rounded-full animate-[spin_100s_linear_infinite]" />
    </div>
  );
}
