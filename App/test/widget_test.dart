import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smarthaul/app.dart';
import 'package:smarthaul/core/network/api_exception.dart';

import 'support/fake_api.dart';
import 'support/fakes.dart';

Future<void> _signIn(WidgetTester tester, {required bool driver}) async {
  final roleCard = find.byKey(Key(driver ? 'truckDriverRoleCard' : 'cargoOwnerRoleCard'));
  await tester.ensureVisible(roleCard);
  await tester.tap(roleCard);
  await tester.pumpAndSettle();
  final continueButton = find.byKey(const Key('welcomeContinueButton'));
  await tester.ensureVisible(continueButton);
  await tester.tap(continueButton);
  await tester.pumpAndSettle();

  final fields = find.byType(TextFormField);
  await tester.enterText(fields.at(0), 'user@example.com');
  await tester.enterText(fields.at(1), 'Secret#123');
  await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('cargo owner signs in and sees real shipments', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.reset);

    final t = await buildServices();
    t.api
      ..on('POST /auth/login', (body, _) {
        expect((body as Map)['role'], 'CARGO_OWNER');
        return {'token': 'tok', 'user': userJson()};
      })
      ..on('GET /shipments', (_, __) => [shipmentJson(bids: [bidJson()])]);

    await tester.pumpWidget(SmartHaulApp(services: t.services));
    await tester.pumpAndSettle();
    expect(find.text('Select Language / زبان منتخب کریں'), findsOneWidget);

    await _signIn(tester, driver: false);

    expect(find.text('Tariq Mills Ltd.'), findsOneWidget);
    expect(find.text('SH-1001'), findsWidgets);
    expect(find.text('Lahore → Islamabad'), findsWidgets);
  });

  testWidgets('wrong password shows the server message and stays on sign in', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.reset);

    final t = await buildServices();
    t.api.on('POST /auth/login', (_, __) => throw const ApiException('INVALID_CREDENTIALS', 'Wrong password.', 401));

    await tester.pumpWidget(SmartHaulApp(services: t.services));
    await tester.pumpAndSettle();
    await _signIn(tester, driver: false);

    expect(find.text('Wrong password.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  testWidgets('driver with an active trip sees one next step and can open it', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.reset);

    final t = await buildServices();
    t.api
      ..on('POST /auth/login', (body, _) => {'token': 'tok', 'user': userJson(role: 'DRIVER', name: 'Bilal Khan', status: 'VERIFIED')})
      ..on('GET /driver/active-trip', (_, __) => {'id': 't1', 'vehicle': {'id': 'v1'}, 'shipment': shipmentJson(status: 'BOOKED')})
      ..on('GET /driver/vehicles', (_, __) => [])
      ..on('GET /driver/matched-shipments', (_, __) => [])
      ..on('GET /driver/earnings', (_, __) => {'totalCompletedTrips': 0, 'totalEarningsPKR': 0, 'pendingSettlementPKR': 0})
      ..on('GET /driver/penalties', (_, __) => {'activeThisMonth': 0, 'limit': 3});

    await tester.pumpWidget(SmartHaulApp(services: t.services));
    await tester.pumpAndSettle();
    await _signIn(tester, driver: true);

    expect(find.text('Active Assignment'), findsWidgets);
    await tester.tap(find.text('Open trip'));
    await tester.pumpAndSettle();

    expect(find.text('Reached pickup'), findsWidgets);
    expect(find.text('Cancel trip'), findsOneWidget);
    expect(find.text('Cargo loaded'), findsOneWidget); // timeline only, no button
  });
}
