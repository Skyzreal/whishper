import { countdownTo } from './countdown';

describe('countdownTo', () => {
  it('counts down to the next Christmas at local midnight', () => {
    expect(countdownTo(new Date(2026, 11, 24, 23, 58, 30))).toEqual({ today: false, days: 0, hours: 0, minutes: 1, seconds: 30 });
    expect(countdownTo(new Date(2026, 10, 20, 12, 0, 0))).toEqual({ today: false, days: 34, hours: 12, minutes: 0, seconds: 0 });
  });

  it('shows the celebration all day on Christmas', () => {
    expect(countdownTo(new Date(2026, 11, 25, 0, 0, 0))).toEqual({ today: true });
    expect(countdownTo(new Date(2026, 11, 25, 23, 59, 59))).toEqual({ today: true });
  });

  it('rolls over to next year after Christmas', () => {
    expect(countdownTo(new Date(2026, 11, 26, 0, 0, 0))).toEqual({ today: false, days: 364, hours: 0, minutes: 0, seconds: 0 });
  });

  it('supports a custom exchange date', () => {
    expect(countdownTo(new Date(2026, 11, 20), { month: 12, day: 24 })).toMatchObject({ today: false, days: 4 });
  });
});
