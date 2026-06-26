import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface StorageVisualizerProps {
  limit: number;
  usage: number;
  free: number;
  totalFiles: string;
}

export default function StorageVisualizer({ limit, usage, free, totalFiles }: StorageVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous SVG
    d3.select(containerRef.current).selectAll('*').remove();

    const width = 280;
    const height = 280;
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
      .innerRadius(radius - 24)
      .outerRadius(radius - 16)
      .startAngle(0)
      .endAngle(2 * Math.PI);

    // Background track
    svg.append('path')
      .attr('d', radialArc as any)
      .attr('fill', '#022c22')
      .attr('opacity', 0.4)
      .attr('stroke', '#064e3b')
      .attr('stroke-width', 1);

    // Dynamic Used Arc
    const usedArc = d3.arc<any, any>()
      .innerRadius(radius - 24)
      .outerRadius(radius - 16)
      .startAngle(0)
      .endAngle(2 * Math.PI * percentage);

    svg.append('path')
      .attr('d', usedArc as any)
      .attr('fill', '#10b981')
      .attr('filter', 'url(#neon-glow)')
      .attr('opacity', 0.85);

    // Ticks & Grid markers
    const ticksCount = 40;
    for (let i = 0; i < ticksCount; i++) {
      const angle = (i / ticksCount) * 2 * Math.PI;
      const isUsed = (i / ticksCount) <= percentage;
      const x1 = Math.sin(angle) * (radius - 10);
      const y1 = -Math.cos(angle) * (radius - 10);
      const x2 = Math.sin(angle) * (radius - 2);
      const y2 = -Math.cos(angle) * (radius - 2);

      svg.append('line')
        .attr('x1', x1)
        .attr('y1', y1)
        .attr('x2', x2)
        .attr('y2', y2)
        .attr('stroke', isUsed ? '#34d399' : '#047857')
        .attr('stroke-width', isUsed ? 1.5 : 1)
        .attr('opacity', isUsed ? 0.9 : 0.25);
    }

    // Interactive Core (pulsing hover center)
    const centerGroup = svg.append('g')
      .style('cursor', 'pointer');

    const coreCircle = centerGroup.append('circle')
      .attr('r', radius - 35)
      .attr('fill', '#022c22')
      .attr('opacity', 0.2)
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4, 4');

    // Pulse animation
    function pulse() {
      coreCircle.transition()
        .duration(1500)
        .attr('r', radius - 30)
        .style('opacity', 0.4)
        .transition()
        .duration(1500)
        .attr('r', radius - 35)
        .style('opacity', 0.2)
        .on('end', pulse);
    }
    pulse();

    // Text details inside core
    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-20px')
      .attr('fill', '#34d399')
      .attr('font-size', '10px')
      .attr('font-family', 'monospace')
      .attr('letter-spacing', '2px')
      .text('USAGE MATRIX');

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '5px')
      .attr('fill', '#ffffff')
      .attr('font-size', '24px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'monospace')
      .attr('filter', 'url(#neon-glow)')
      .text(`${Math.round(percentage * 100)}%`);

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '24px')
      .attr('fill', '#059669')
      .attr('font-size', '9px')
      .attr('font-family', 'monospace')
      .text(`${totalFiles} MAPPED`);

    centerGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '40px')
      .attr('fill', '#10b981')
      .attr('font-size', '8px')
      .attr('font-family', 'monospace')
      .attr('letter-spacing', '1px')
      .text('SECURE CLOUD');

  }, [limit, usage, free, totalFiles]);

  return (
    <div className="flex flex-col items-center justify-center relative p-2 select-none">
      <div ref={containerRef} className="w-[280px] h-[280px]" id="d3-visualizer-container" />
      <div className="absolute inset-0 border border-emerald-500/5 pointer-events-none rounded-full animate-[spin_100s_linear_infinite]" />
    </div>
  );
}
