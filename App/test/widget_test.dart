import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarthaul/app.dart';

void main() {
  testWidgets('1. SmartHaul onboarding and Cargo Owner dashboard flow',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(const SmartHaulApp());
    await tester.pumpAndSettle();

    // Verify initial welcome screen elements
    expect(find.text('SmartHaul'), findsWidgets);
    expect(find.text('Select Language / زبان منتخب کریں'), findsOneWidget);
    expect(find.text('Select Role / کردار کا انتخاب'), findsOneWidget);

    // Tap on Cargo Owner role
    final cargoOwnerCard = find.byKey(const Key('cargoOwnerRoleCard'));
    await tester.ensureVisible(cargoOwnerCard);
    await tester.tap(cargoOwnerCard);
    await tester.pumpAndSettle();

    // Tap Continue button
    final continueBtn = find.byKey(const Key('welcomeContinueButton'));
    await tester.ensureVisible(continueBtn);
    await tester.tap(continueBtn);
    await tester.pumpAndSettle();

    // Verify Cargo Owner Dashboard elements
    expect(find.text('Tariq Mills Ltd.'), findsOneWidget);
    expect(find.text('Active Fleet'), findsOneWidget);
    expect(find.text('Open Loads'), findsOneWidget);
    expect(find.text('Active Shipment'), findsOneWidget);
    expect(find.text('Non-Custodial Audit Ledger'), findsOneWidget);
  });

  testWidgets('2. SmartHaul Driver role selection and dashboard interactions',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(const SmartHaulApp());
    await tester.pumpAndSettle();

    // Tap on Truck Driver role card
    final driverCard = find.byKey(const Key('truckDriverRoleCard'));
    await tester.ensureVisible(driverCard);
    await tester.tap(driverCard);
    await tester.pumpAndSettle();

    // Tap Continue button
    final continueBtn = find.byKey(const Key('welcomeContinueButton'));
    await tester.ensureVisible(continueBtn);
    await tester.tap(continueBtn);
    await tester.pumpAndSettle();

    // Verify Driver Dashboard
    expect(find.text('Salam, Ahmad'), findsOneWidget);
    expect(find.text('START TRANSIT (روانہ ہوں)'), findsOneWidget);
    expect(find.text('Today\'s Pay'), findsOneWidget);
    expect(find.text('Driving Hours'), findsOneWidget);
  });

  testWidgets('3. Tab navigation to Live GPS Tracking and Audit Ledger',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(const SmartHaulApp());
    await tester.pumpAndSettle();

    // Onboard as Cargo Owner
    final continueBtn = find.byKey(const Key('welcomeContinueButton'));
    await tester.ensureVisible(continueBtn);
    await tester.tap(continueBtn);
    await tester.pumpAndSettle();

    // Tap Tracking Tab
    await tester.tap(find.byIcon(Icons.near_me_outlined));
    await tester.pumpAndSettle();

    // Verify Live GPS Tracking screen
    expect(find.text('Live GPS • 78 km/h'), findsOneWidget);
    expect(find.text('Trip Milestone Progress'), findsOneWidget);

    // Tap Ledger Tab
    await tester.tap(find.byIcon(Icons.receipt_long_outlined));
    await tester.pumpAndSettle();

    // Verify Direct Carrier Settlement Audit Ledger
    expect(find.text('DIRECT CARRIER SETTLEMENT'), findsOneWidget);
    expect(find.text('Non-Custodial Audit Ledger'), findsWidgets);
  });

  testWidgets('4. Urdu language localization and bidirectional toggle',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() => tester.view.resetPhysicalSize());

    await tester.pumpWidget(const SmartHaulApp());
    await tester.pumpAndSettle();

    // Select Urdu language
    await tester.tap(find.text('اردو (Urdu)'));
    await tester.pumpAndSettle();

    // Tap Continue
    final continueBtn = find.byKey(const Key('welcomeContinueButton'));
    await tester.ensureVisible(continueBtn);
    await tester.tap(continueBtn);
    await tester.pumpAndSettle();

    // Verify Urdu Dashboard
    expect(find.text('طارق ملز لمیٹڈ'), findsOneWidget);
    expect(find.text('فعال فلیٹ'), findsOneWidget);
    expect(find.text('کھلے لوڈز'), findsOneWidget);
  });
}
