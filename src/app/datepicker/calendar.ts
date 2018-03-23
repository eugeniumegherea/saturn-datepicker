/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  Optional,
  Output,
  SimpleChanges,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import {DateAdapter, MAT_DATE_FORMATS, MatDateFormats} from '@angular/material/core';
import {Subscription} from 'rxjs/Subscription';
import {createMissingDateImplError} from './datepicker-errors';
import {SatDatepickerIntl} from './datepicker-intl';
import {SatMonthView} from './month-view';
import {SatMultiYearView, yearsPerPage} from './multi-year-view';
import {SatYearView} from './year-view';
import {SatDatepickerRangeValue} from './datepicker-input';


/**
 * A calendar that is used as part of the datepicker.
 * @docs-private
 */
@Component({
  moduleId: module.id,
  selector: 'sat-calendar',
  templateUrl: 'calendar.html',
  styleUrls: ['calendar.css'],
  host: {
    'class': 'mat-calendar',
  },
  exportAs: 'matCalendar',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SatCalendar<D> implements AfterContentInit, OnDestroy, OnChanges {
  private _intlChanges: Subscription;

  /** A date representing the period (month or year) to start the calendar in. */
  @Input()
  get startAt(): D | null { return this._startAt; }
  set startAt(value: D | null) {
    this._startAt = this._getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _startAt: D | null;

  /** Whether the calendar should be started in month or year view. */
  @Input() startView: 'month' | 'year' | 'multi-year' = 'month';

  /** The currently selected date. */
  @Input()
  get selected(): D | null { return this._selected; }
  set selected(value: D | null) {
    this._selected = this._getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _selected: D | null;

  /** The minimum selectable date. */
  @Input()
  get minDate(): D | null { return this._minDate; }
  set minDate(value: D | null) {
    this._minDate = this._getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _minDate: D | null;

  /** The maximum selectable date. */
  @Input()
  get maxDate(): D | null { return this._maxDate; }
  set maxDate(value: D | null) {
    this._maxDate = this._getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _maxDate: D | null;

 /** Beginning of date range. */
  @Input()
  get beginDate(): D | null { return this._beginDate; }
  set beginDate(value: D | null) {
    this._beginDate = this._getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _beginDate: D | null;

 /** Date range end. */
  @Input()
  get endDate(): D | null { return this._endDate; }
  set endDate(value: D | null) {
    this._endDate = this._getValidDateOrNull(this._dateAdapter.deserialize(value));
  }
  private _endDate: D | null;

  /** Whenever datepicker is for selecting range of dates. */
  @Input() rangeMode = false;

  /** A function used to filter which dates are selectable. */
  @Input() dateFilter: (date: D) => boolean;

  /** Emits when the currently selected date changes. */
  @Output() readonly selectedChange: EventEmitter<D> = new EventEmitter<D>();

  /**
   * Emits the year chosen in multiyear view.
   * This doesn't imply a change on the selected date.
   */
  @Output() readonly yearSelected: EventEmitter<D> = new EventEmitter<D>();

  /**
   * Emits the month chosen in year view.
   * This doesn't imply a change on the selected date.
   */
  @Output() readonly monthSelected: EventEmitter<D> = new EventEmitter<D>();

  /** Emits when any date is selected. */
  @Output() readonly _userSelection: EventEmitter<void> = new EventEmitter<void>();

  /** Emits when new pair of dates selected. */
  @Output() dateRangesChange = new EventEmitter<SatDatepickerRangeValue<D>>();

  /** Reference to the current month view component. */
  @ViewChild(SatMonthView) monthView: SatMonthView<D>;

  /** Reference to the current year view component. */
  @ViewChild(SatYearView) yearView: SatYearView<D>;

  /** Reference to the current multi-year view component. */
  @ViewChild(SatMultiYearView) multiYearView: SatMultiYearView<D>;

  /** Whenever user already selected start of dates interval. */
  private _beginDateSelected = false;

  /** Date filter for the month, year, and multi-year views. */
  _dateFilterForViews = (date: D) => {
    return !!date &&
        (!this.dateFilter || this.dateFilter(date)) &&
        (!this.minDate || this._dateAdapter.compareDate(date, this.minDate) >= 0) &&
        (!this.maxDate || this._dateAdapter.compareDate(date, this.maxDate) <= 0);
  }

  /**
   * The current active date. This determines which time period is shown and which date is
   * highlighted when using keyboard navigation.
   */
  get _activeDate(): D { return this._clampedActiveDate; }
  set _activeDate(value: D) {
    this._clampedActiveDate = this._dateAdapter.clampDate(value, this.minDate, this.maxDate);
  }
  private _clampedActiveDate: D;

  /** Whether the calendar is in month view. */
  _currentView: 'month' | 'year' | 'multi-year';

  /** The label for the current calendar view. */
  get _periodButtonText(): string {
    if (this._currentView == 'month') {
      return this._dateAdapter.format(this._activeDate, this._dateFormats.display.monthYearLabel)
          .toLocaleUpperCase();
    }
    if (this._currentView == 'year') {
      return this._dateAdapter.getYearName(this._activeDate);
    }
    const activeYear = this._dateAdapter.getYear(this._activeDate);
    const firstYearInView = this._dateAdapter.getYearName(
        this._dateAdapter.createDate(activeYear - activeYear % 24, 0, 1));
    const lastYearInView = this._dateAdapter.getYearName(
        this._dateAdapter.createDate(activeYear + yearsPerPage - 1 - activeYear % 24, 0, 1));
    return `${firstYearInView} \u2013 ${lastYearInView}`;
  }

  get _periodButtonLabel(): string {
    return this._currentView == 'month' ?
        this._intl.switchToMultiYearViewLabel : this._intl.switchToMonthViewLabel;
  }

  /** The label for the the previous button. */
  get _prevButtonLabel(): string {
    return {
      'month': this._intl.prevMonthLabel,
      'year': this._intl.prevYearLabel,
      'multi-year': this._intl.prevMultiYearLabel
    }[this._currentView];
  }

  /** The label for the the next button. */
  get _nextButtonLabel(): string {
    return {
      'month': this._intl.nextMonthLabel,
      'year': this._intl.nextYearLabel,
      'multi-year': this._intl.nextMultiYearLabel
    }[this._currentView];
  }

  constructor(private _intl: SatDatepickerIntl,
              private _dateAdapter: DateAdapter<D>,
              @Optional() @Inject(MAT_DATE_FORMATS) private _dateFormats: MatDateFormats,
              changeDetectorRef: ChangeDetectorRef) {

    if (!this._dateAdapter) {
      throw createMissingDateImplError('DateAdapter');
    }

    if (!this._dateFormats) {
      throw createMissingDateImplError('MAT_DATE_FORMATS');
    }

    this._intlChanges = _intl.changes.subscribe(() => changeDetectorRef.markForCheck());
  }

  ngAfterContentInit() {
    this._activeDate = this.startAt || this._dateAdapter.today();
    this._currentView = this.startView;
  }

  ngOnDestroy() {
    this._intlChanges.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges) {
    const change = changes.minDate || changes.maxDate || changes.dateFilter;

    if (change && !change.firstChange) {
      const view = this.monthView || this.yearView || this.multiYearView;

      if (view) {
        view._init();
      }
    }
  }

  /** Handles date selection in the month view. */
  _dateSelected(date: D): void {
    if (this.rangeMode) {
        if (!this._beginDateSelected) {
          this._beginDateSelected = true;
          this.beginDate = date;
          this.endDate = date;
        } else {
          this._beginDateSelected = false;
          if (this._dateAdapter.compareDate(<D>this.beginDate, date) <= 0) {
            this.dateRangesChange.emit({begin: <D>this.beginDate, end: date});
          } else {
            this.dateRangesChange.emit({begin: date, end: <D>this.beginDate});
          }
        }
    } else if (!this._dateAdapter.sameDate(date, this.selected)) {
      this.selectedChange.emit(date);
    }
  }

  /** Handles year selection in the multiyear view. */
  _yearSelectedInMultiYearView(normalizedYear: D) {
    this.yearSelected.emit(normalizedYear);
  }

  /** Handles month selection in the year view. */
  _monthSelectedInYearView(normalizedMonth: D) {
    this.monthSelected.emit(normalizedMonth);
  }

  _userSelected(): void {
    this._userSelection.emit();
  }

  /** Handles year/month selection in the multi-year/year views. */
  _goToDateInView(date: D, view: 'month' | 'year' | 'multi-year'): void {
    this._activeDate = date;
    this._currentView = view;
  }

  /** Handles user clicks on the period label. */
  _currentPeriodClicked(): void {
    this._currentView = this._currentView == 'month' ? 'multi-year' : 'month';
  }

  /** Handles user clicks on the previous button. */
  _previousClicked(): void {
    this._activeDate = this._currentView == 'month' ?
        this._dateAdapter.addCalendarMonths(this._activeDate, -1) :
        this._dateAdapter.addCalendarYears(
            this._activeDate, this._currentView == 'year' ? -1 : -yearsPerPage);
  }

  /** Handles user clicks on the next button. */
  _nextClicked(): void {
    this._activeDate = this._currentView == 'month' ?
        this._dateAdapter.addCalendarMonths(this._activeDate, 1) :
        this._dateAdapter.addCalendarYears(
            this._activeDate, this._currentView == 'year' ? 1 : yearsPerPage);
  }

  /** Whether the previous period button is enabled. */
  _previousEnabled(): boolean {
    if (!this.minDate) {
      return true;
    }
    return !this.minDate || !this._isSameView(this._activeDate, this.minDate);
  }

  /** Whether the next period button is enabled. */
  _nextEnabled(): boolean {
    return !this.maxDate || !this._isSameView(this._activeDate, this.maxDate);
  }

  /** Whether the two dates represent the same view in the current view mode (month or year). */
  private _isSameView(date1: D, date2: D): boolean {
    if (this._currentView == 'month') {
      return this._dateAdapter.getYear(date1) == this._dateAdapter.getYear(date2) &&
          this._dateAdapter.getMonth(date1) == this._dateAdapter.getMonth(date2);
    }
    if (this._currentView == 'year') {
      return this._dateAdapter.getYear(date1) == this._dateAdapter.getYear(date2);
    }
    // Otherwise we are in 'multi-year' view.
    return Math.floor(this._dateAdapter.getYear(date1) / yearsPerPage) ==
        Math.floor(this._dateAdapter.getYear(date2) / yearsPerPage);
  }

  /**
   * @param obj The object to check.
   * @returns The given object if it is both a date instance and valid, otherwise null.
   */
  private _getValidDateOrNull(obj: any): D | null {
    return (this._dateAdapter.isDateInstance(obj) && this._dateAdapter.isValid(obj)) ? obj : null;
  }
}
